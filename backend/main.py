import os
import json
import time
from typing import List, Optional, Any, Dict, Union
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
from pydantic import BaseModel
import openai
from sglang.utils import execute_shell_command, wait_for_server

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model configuration

# Initialize SGLang server
def init_sglang_server(MODEL_PATH):
    server_process = execute_shell_command(
        f"""python -m sglang.launch_server 
        --model-path {MODEL_PATH} 
        --port 30020 
        --host 0.0.0.0 
        --tp-size 1
        --random-seed 2024
        --enable-torch-compile
        --enable-flashinfer-mla
        """
    )
    wait_for_server("http://localhost:30020")
    return server_process

# Initialize OpenAI client for SGLang
client = openai.Client(base_url="http://127.0.0.1:30020/v1", api_key="None")

# Global counter for batch requests
num_requests_so_far = 0

# Global variables to track batch progress
current_batch_results = []
current_batch_total = 0
current_batch_index = 0
current_batch_correct = 0
current_batch_df = None
current_batch_max_num_seqs = 3
current_batch_max_length = 1000
current_model_name = "casperhansen/deepseek-r1-distill-qwen-1.5b-awq"
current_system_prompt = None

class BatchRequest(BaseModel):
    max_num_seqs: int = 8
    max_length: int = 14000

def extract_boxed_text(text: str, num_tokens: int, max_tokens: int):
    import re
    print("LENGTH: ", num_tokens)
    pattern = r'oxed{(.*?)}'
    matches = re.findall(pattern, text)
    for match in matches[::-1]:
        if match != "":
            return (match, num_tokens)
    # there is an answer but not boxed
    if num_tokens < max_tokens - 5:
        return (naive_parse(text), num_tokens)
    return ("", max_tokens)

def naive_parse(answer: str):
    out = []
    start = False
    end = False
    for l in reversed(list(answer)):
        if l in '0123456789' and not end:
            start = True
            out.append(l)
        else:
            if start:
                end = True
                break

    out = out[::-1]
    print("NAIVE PARSE OUT: ", out)
    return ''.join(out) if len(out) != 0 else ""

from collections import Counter
import random
def select_answer(answers):
    counter = Counter()
    for answer, num_tokens, weight, method in answers:
        try:
            if int(answer) == float(answer):
                if method == "C":
                    counter[int(answer)] += weight + random.random() / 250
                else:
                    counter[int(answer)] += 1 + random.random() / 1_000
        except:
            pass
    print("COUNTER: ", counter)
    if not counter:
        return random.randint(0, 999)
    _, answer = sorted([(v,k) for k,v in counter.items()], reverse=True)[0]
    return answer%1000

def batch_message_generate(list_of_messages: list[str], max_tokens: int):
    global num_requests_so_far
    print(max_tokens)
    start_processed_time = time.time()
    
    try:
        requests = []
        for i, msg in enumerate(list_of_messages):
            requests.append(
                {
                    "custom_id": f"request-{num_requests_so_far}",
                    "method": "POST",
                    "url": "/chat/completions",
                    "body": {
                        "model": current_model_name,
                        "messages": msg,
                        "max_tokens": max_tokens,
                        "temperature": 0.6,
                        "top_p": 0.95,
                        "min_p": 0.05,
                        "stop": ["</think>"]
                    },
                }
            )
            num_requests_so_far += 1
    
        input_file_path = "batch_requests.jsonl"
    
        with open(input_file_path, "w") as f:
            for req in requests:
                f.write(json.dumps(req) + "\n")
        
        with open(input_file_path, "rb") as f:
            file_response = client.files.create(file=f, purpose="batch")
        
        batch_response = client.batches.create(
            input_file_id=file_response.id,
            endpoint="/v1/chat/completions",
            completion_window="24h",
        )
        
        print(f"Batch job created with ID: {batch_response.id}")
    
        while batch_response.status not in ["completed", "failed", "cancelled"]:
            time.sleep(3)
            batch_response = client.batches.retrieve(batch_response.id)
        
        if batch_response.status == "completed":
            print("Batch job completed successfully!")
            print(f"Request counts: {batch_response.request_counts}")
        
            result_file_id = batch_response.output_file_id
            file_response = client.files.content(result_file_id)
            result_content = file_response.read().decode("utf-8")
        
            results = [
                json.loads(line) for line in result_content.split("\n") if line.strip() != ""
            ]
            
            output_token_lengths = [
                result['response']['body']['usage']['completion_tokens'] for result in results
            ]
            results = [
                result['response']['body']['choices']['message']['content'] for result in results
            ]
        
            print("Cleaning up files...")
            # Only delete the result file ID since file_response is just content
            client.files.delete(result_file_id)
            print(f"Prompts processed in {time.time() - start_processed_time} seconds")
            print(f"Output Lengths: {output_token_lengths}")
        else:
            print(f"Batch job failed with status: {batch_response.status}")
            if hasattr(batch_response, "errors"):
                print(f"Errors: {batch_response.errors}")
            output_token_lengths = [0 for _ in range(len(list_of_messages))]
            results = ["" for _ in range(len(list_of_messages))]
        
    except Exception as e:
        print(e)
        output_token_lengths = [0 for _ in range(len(list_of_messages))]
        results = ["" for _ in range(len(list_of_messages))]
    
    return results, output_token_lengths

def extract_answer(list_of_messages: list[str], generation_lengths: list[int], max_tokens: int):
    extracted_answers = []
    for message, gen_length in zip(list_of_messages, generation_lengths):
        print("=====")
        # print(message[-100:])
        answer, num_tokens = extract_boxed_text(message, num_tokens=gen_length, max_tokens=max_tokens)
        print("INIT ANSWER: ", answer)
        if "oxed{" in message[-128:]:
            extracted_answers.append((answer, num_tokens, 4))
        else:
            extracted_answers.append((answer, num_tokens, 2))
    return extracted_answers

def create_starter_messages(question: str, index: int, system_prompt: str) -> str:
    options = []
    for _ in range(8):
        messages = [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': question}
        ]
        options.append(messages)
    
    return options[index % len(options)]

def convert_numpy_types(obj: Any) -> Any:
    """
    Convert NumPy types to Python native types for JSON serialization.
    """
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {key: convert_numpy_types(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(item) for item in obj]
    else:
        return obj

def process_single_question(row, max_num_seqs, max_length):
    """
    Process a single question and return the result.
    """
    global current_batch_index, current_batch_correct, current_system_prompt
    
    id = row['id']
    problem = row['problem']
    answer = row['answer']
    
    messages = [create_starter_messages(problem, i, current_system_prompt) for i in range(max_num_seqs)]
    batch_results, token_lengths = batch_message_generate(messages, max_length)
    extracted_answers = extract_answer(batch_results, token_lengths, max_length)
    extracted_answers = [(x[0], x[1], x[2], "C") for x in extracted_answers]
    predicted_answer = select_answer(extracted_answers)
    
    try:
        for i in range(len(messages)):
            messages[i].append({"role": "assistant", 'content': batch_results[i] + "\n\nOh, I suddenly got the answer to the whole problem, Final Answer: \\boxed{"})
        
        estimation_texts, estimation_lengths = batch_message_generate(messages, max_tokens=8)
        estimation_texts = [msg[-1]['content'] + text for msg, text in zip(messages, estimation_texts)]
        estimated_answers = extract_answer(estimation_texts, estimation_lengths, max_tokens=8)
        
        estimated_answers = [(x[0], x[1], x[2], "E") for x in estimated_answers]
        all_extracted_answers = extracted_answers + estimated_answers
        predicted_answer = select_answer(all_extracted_answers)

    except Exception as e:
        print(f"Estimation failed: {e}")
        all_extracted_answers = extracted_answers
    
    result = {
        "id": convert_numpy_types(id),
        "problem": problem,
        "true_answer": convert_numpy_types(answer),
        "predicted_answer": convert_numpy_types(predicted_answer),
        "extracted_answers": [f"{a} | {t}" for a, t, w, m in extracted_answers],
        "progress": f"{current_batch_index + 1}/{current_batch_total}"
    }
    
    try:
        if int(answer) == int(predicted_answer):
            current_batch_correct += 1
    except:
        pass

    current_batch_results.append(result)
    current_batch_index += 1
    
    return result

@app.get("/batch")
async def get_batch_progress():
    """
    Get the current progress of the batch processing.
    Returns the current result and progress information.
    """
    current_status = None
    if current_batch_df is None:
        current_status = {
            "status": "waiting",
            "message": "No batch processing in progress"
        }
    
    elif current_batch_index >= current_batch_total:
        current_status = {
            "status": "completed",
            "message": f"All {current_batch_total} questions completed. Correct: {current_batch_correct}/{current_batch_total}",
            "results": current_batch_results
        }
    
    # Process the next question if available
    elif current_batch_index < len(current_batch_df):
        next_row = current_batch_df.iloc[current_batch_index]
        result = process_single_question(
            next_row, 
            current_batch_max_num_seqs, 
            current_batch_max_length
        )
        
        current_status = {
            "status": "in_progress",
            "current": current_batch_index,
            "total": current_batch_total,
            "correct_so_far": current_batch_correct,
            "current_result": result,
            "results": current_batch_results
        }

    else:
        current_status = {
            "status": "waiting",
            "message": "No batch processing in progress"
        }

    print(current_status)
    return current_status

@app.post("/batch")
async def batch_inference(
    file: UploadFile = File(...),
    max_num_seqs: int = 3,
    max_length: int = 1000,
    model_name: str = Form("casperhansen/deepseek-r1-distill-qwen-1.5b-awq"),
    system_prompt: str = Form(
        "Please reason step by step, and put your final answer within \\boxed{}." +
        "The final answer must be an integer between 0 and 999, inclusive. You should arrive at this number by taking the problem solution modulo 1000."
    ),
):
    try:
        # Read and validate CSV file
        df = pd.read_csv(file.file)
        print(f"Processing batch with max_num_seqs={max_num_seqs}, max_length={max_length}")
        print(f"Using model: {model_name}")
        print(f"System prompt: {system_prompt}")
        
        df = df[df.problem == df.problem].reset_index(drop=True)
        if not all(col in df.columns for col in ['problem', 'answer']):
            raise HTTPException(status_code=400, detail="CSV must contain 'problem' and 'answer' columns")
        
        # Reset global tracking variables
        global current_batch_results, current_batch_total, current_batch_index, current_batch_correct
        global current_batch_df, current_batch_max_num_seqs, current_batch_max_length
        global current_model_name, current_system_prompt
        
        # Check if we need to reinitialize the model
        if current_model_name != model_name:
            current_model_name = model_name

        init_sglang_server(current_model_name)
        
        current_batch_results = []
        current_batch_total = len(df)
        current_batch_index = 0
        current_batch_correct = 0
        current_batch_df = df
        current_batch_max_num_seqs = max_num_seqs
        current_batch_max_length = max_length
        current_system_prompt = system_prompt
        
        return {
            "status": "started",
            "message": f"Batch processing started for {current_batch_total} questions",
            "total": current_batch_total
        }
    
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 

