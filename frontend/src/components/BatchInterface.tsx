import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Paper,
  Typography,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ICellRendererParams, AllCommunityModule, ModuleRegistry} from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

// Register AG Grid Modules
ModuleRegistry.registerModules([AllCommunityModule]);

interface Result {
  id: string;
  problem: string;
  true_answer: string;
  predicted_answer: string;
  progress: string;
  predictions: string[];  // array of "answer | tokens" strings
}

const BatchInterface: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [maxNumSeqs, setMaxNumSeqs] = useState(8);
  const [maxLength, setMaxLength] = useState(14000);
  const [modelName, setModelName] = useState("casperhansen/deepseek-r1-distill-qwen-1.5b-awq");
  const [systemPrompt, setSystemPrompt] = useState(
    "Please reason step by step, and put your final answer within \\boxed{}." +
    "The final answer must be an integer between 0 and 999, inclusive. You should arrive at this number by taking the problem solution modulo 1000."
  );
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [currentProgress, setCurrentProgress] = useState('');
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [batchStatus, setBatchStatus] = useState<{
    status: 'waiting' | 'in_progress' | 'completed' | 'error';
    current?: number;
    total?: number;
    correct_so_far?: number;
    current_result?: Result;
    message?: string;
  }>({ status: 'waiting' });

  const pollBatchProgress = async () => {
    try {
      const response = await fetch('http://localhost:8000/batch');
      if (!response.ok) {
        throw new Error('Failed to fetch batch progress');
      }
      
      const data = await response.json();
      setBatchStatus(data);
      
      if (data.status === 'in_progress' && data.current_result) {
        const questionNumber = data.current;
        setCurrentProgress(
          `Question ${questionNumber} complete, Answer: ${data.current_result.true_answer}, Predicted Answer: ${data.current_result.predicted_answer}, Correct so far: ${data.correct_so_far}/${questionNumber}`
        );
        
        if (data.results && data.results.length > 0) {
          setResults(data.results);
        }
      } else if (data.status === 'completed') {
        setCurrentProgress(data.message || 'Batch processing completed');
        if (data.results && data.results.length > 0) {
          setResults(data.results);
        }
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error polling batch progress:', error);
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading && !pollingInterval) {
      const interval = setInterval(pollBatchProgress, 1000);
      setPollingInterval(interval);
    }
    
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    };
  }, [isLoading]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsLoading(true);
    setResults([]);
    setCurrentProgress('');
    setBatchStatus({ status: 'waiting' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model_name', modelName);
    formData.append('system_prompt', systemPrompt);
    
    const url = `http://localhost:8000/batch?max_num_seqs=${maxNumSeqs}&max_length=${maxLength}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to process batch');
      }

      const data = await response.json();
      
      if (data.status === 'started') {
        if (!pollingInterval) {
          const interval = setInterval(pollBatchProgress, 1000);
          setPollingInterval(interval);
        }
      } else {
        throw new Error('Unexpected response from server');
      }
    } catch (error) {
      console.error('Error:', error);
      setResults([{
        id: 'Error',
        problem: 'Error',
        true_answer: 'Error',
        predicted_answer: 'Failed to process batch',
        progress: '0/0',
        predictions: []
      }]);
      setIsLoading(false);
    }
  };

  const generatePredictionColumns = (numSeqs: number): ColDef<Result>[] => {
    return Array.from({ length: numSeqs }, (_, i) => ({
      field: 'predictions',
      headerName: `Pred ${i + 1}`,
      sortable: true,
      filter: true,
      width: 120,
      valueGetter: (params) => {
        if (!params.data) return '-';
        return params.data.predictions[i] || '-';
      },
      cellStyle: (params): { [key: string]: string } => {
        if (!params.value || params.value === '-' || !params.data) {
          return { color: '#999' };
        }
        const answer = params.value.split(' | ')[0];
        const isCorrect = answer === params.data.true_answer;
        return {
          backgroundColor: isCorrect ? 'rgba(76, 175, 80, 0.1)' : 'transparent',
          fontWeight: isCorrect ? 'bold' : 'normal',
          color: 'inherit'
        };
      }
    }));
  };

  const columnDefs: ColDef<Result>[] = [
    { 
      field: 'id', 
      headerName: 'ID', 
      sortable: true, 
      filter: true,
      width: 100
    },
    { 
      field: 'problem', 
      headerName: 'Problem', 
      sortable: true, 
      filter: true,
      flex: 1,
      minWidth: 300
    },
    { 
      field: 'true_answer', 
      headerName: 'True', 
      sortable: true, 
      filter: true,
      width: 100
    },
    { 
      field: 'predicted_answer', 
      headerName: 'Final', 
      sortable: true, 
      filter: true,
      width: 100,
      cellStyle: (params): { [key: string]: string } => {
        if (!params.data) return { color: 'inherit' };
        return {
          backgroundColor: params.value === params.data.true_answer ? 'rgba(76, 175, 80, 0.1)' : 'transparent',
          fontWeight: params.value === params.data.true_answer ? 'bold' : 'normal',
          color: 'inherit'
        };
      }
    },
    ...generatePredictionColumns(maxNumSeqs)
  ];

  const handleDownload = () => {
    if (results.length === 0) return;

    const headers = ['ID', 'Problem', 'True Answer', 'Predicted Answer', ...Array.from({ length: maxNumSeqs }, (_, i) => `Pred ${i + 1}`)];
    const csvContent = [
      headers,
      ...results.map(r => [
        r.id, 
        r.problem, 
        r.true_answer, 
        r.predicted_answer,
        ...Array.from({ length: maxNumSeqs }, (_, i) => r.predictions[i] || '')
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'batch_results.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const defaultColDef: ColDef<Result> = {
    flex: 1,
    minWidth: 100,
    resizable: true,
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <form onSubmit={handleSubmit}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button
              variant="outlined"
              component="label"
              startIcon={<CloudUploadIcon />}
              disabled={isLoading}
            >
              Upload CSV File
              <input
                type="file"
                hidden
                accept=".csv"
                onChange={handleFileChange}
              />
            </Button>
            {file && (
              <Typography variant="body2">
                Selected file: {file.name}
              </Typography>
            )}

            <TextField
              label="Model Name"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              disabled={isLoading}
              helperText="Enter a valid Hugging Face model name"
              fullWidth
            />

            <TextField
              label="System Prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              disabled={isLoading}
              multiline
              rows={4}
              helperText="Enter the system prompt for the model"
              fullWidth
            />

            <TextField
              label="Max Number of Sequences"
              type="number"
              value={maxNumSeqs}
              onChange={(e) => setMaxNumSeqs(Number(e.target.value))}
              disabled={isLoading}
              inputProps={{ min: 1, max: 100000 }}
            />

            <TextField
              label="Max Length"
              type="number"
              value={maxLength}
              onChange={(e) => setMaxLength(Number(e.target.value))}
              disabled={isLoading}
              inputProps={{ min: 1, max: 100000 }}
            />

            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={!file || isLoading}
            >
              {isLoading ? <CircularProgress size={24} /> : 'Process Batch'}
            </Button>
          </Box>
        </form>
      </Paper>

      {isLoading && (
        <Box sx={{ width: '100%', mb: 3 }}>
          <LinearProgress />
          <Typography variant="body2" sx={{ mt: 1 }}>
            {currentProgress}
          </Typography>
        </Box>
      )}

      {batchStatus.status === 'completed' && (
        <Paper elevation={3} sx={{ p: 3, mb: 3, bgcolor: 'success.light' }}>
          <Typography variant="h6" color="success.dark">
            {batchStatus.message}
          </Typography>
        </Paper>
      )}

      {results.length > 0 && (
        <Paper elevation={3} sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">Results</Typography>
            <Button
              startIcon={<DownloadIcon />}
              onClick={handleDownload}
              disabled={results.length === 0}
            >
              Download CSV
            </Button>
          </Box>

          <div className="ag-theme-alpine" style={{ height: 400, width: '100%', border: '1px solid #ddd' }}>
            <AgGridReact
              rowData={results}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              animateRows={true}
              rowSelection="multiple"
              pagination={true}
              paginationPageSize={10}
            />
          </div>
        </Paper>
      )}
    </Box>
  );
};

export default BatchInterface; 