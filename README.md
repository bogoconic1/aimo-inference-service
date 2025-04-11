# Math QA Assistant

A full-stack application that provides a chatbot interface and batch inference capabilities for math problem solving using the deepseek-r1-distill-qwen-14b-awq model.

## Features

1. Chat Interface
   - Real-time streaming responses
   - Math problem solving with step-by-step explanations
   - Modern, responsive UI

2. Batch Inference
   - Upload CSV files with math problems
   - Configurable parameters (max sequences, max length)
   - Progress tracking and results visualization
   - Export results to CSV

## Prerequisites

- Python 3.8+
- Node.js 14+
- CUDA-capable GPU
- SGLang library
- The deepseek-r1-distill-qwen-14b-awq model

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
```

2. Set up the backend:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. Set up the frontend:
```bash
cd frontend
npm install
```

## Running the Application

1. Start the backend server:
```bash
cd backend
python main.py
```

2. Start the frontend development server:
```bash
cd frontend
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

## Usage

### Chat Interface
1. Navigate to the Chat tab
2. Enter your math question in the text field
3. Click Send or press Enter
4. View the streaming response with step-by-step solution

### Batch Inference
1. Navigate to the Batch Inference tab
2. Upload a CSV file with 'problem' and 'answer' columns
3. Configure max_num_seqs and max_length parameters
4. Click Process Batch
5. View results in the table
6. Download results as CSV

## CSV Format for Batch Inference

The input CSV file should have the following columns:
- problem: The math problem text
- answer: The correct answer

Example:
```csv
problem,answer
"What is 2 + 2?",4
"Solve for x: 3x + 5 = 20",5
```

## License

MIT License 