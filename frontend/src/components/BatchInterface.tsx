import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Paper,
  Typography,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';

interface Result {
  id: string,
  problem: string;
  true_answer: string;
  predicted_answer: string;
  progress: string;
  extracted_answers: [string, number, number, string][];  // [answer, num_tokens, weight, method]
}

const BatchInterface: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [maxNumSeqs, setMaxNumSeqs] = useState(8);
  const [maxLength, setMaxLength] = useState(14000);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [currentProgress, setCurrentProgress] = useState('');
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [batchStatus, setBatchStatus] = useState<{
    status: 'waiting' | 'in_progress' | 'completed';
    current?: number;
    total?: number;
    correct_so_far?: number;
    current_result?: Result;
    message?: string;
  }>({ status: 'waiting' });

  // Function to poll the batch progress
  const pollBatchProgress = async () => {
    try {
      const response = await fetch('http://localhost:8000/batch');
      if (!response.ok) {
        throw new Error('Failed to fetch batch progress');
      }
      
      const data = await response.json();
      setBatchStatus(data);
      
      if (data.status === 'in_progress' && data.current_result) {
        setCurrentProgress(
          `Question ${data.current} complete, Answer: ${data.current_result.true_answer}, Predicted Answer: ${data.current_result.predicted_answer}, Correct so far: ${data.correct_so_far}/${data.current}`
        );
      } else if (data.status === 'completed') {
        setCurrentProgress(data.message || 'Batch processing completed');
        // Stop polling when completed
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      }
    } catch (error) {
      console.error('Error polling batch progress:', error);
    }
  };

  // Start polling when batch processing starts
  useEffect(() => {
    if (isLoading && !pollingInterval) {
      const interval = setInterval(pollBatchProgress, 1000); // Poll every second
      setPollingInterval(interval);
    }
    
    // Cleanup function to clear interval when component unmounts or isLoading changes
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
    
    // Use query parameters instead of form data for these values
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
      setResults(data.results);
    } catch (error) {
      console.error('Error:', error);
      setResults([{
        id: 'Error',
        problem: 'Error',
        true_answer: 'Error',
        predicted_answer: 'Failed to process batch',
        progress: '0/0',
        extracted_answers: []
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (results.length === 0) return;

    const csvContent = [
      ['ID', 'Problem', 'True Answer', 'Predicted Answer'],
      ...results.map(r => [r.id, r.problem, r.true_answer, r.predicted_answer])
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

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Problem</TableCell>
                  <TableCell>True Answer</TableCell>
                  <TableCell>Predicted Answer</TableCell>
                  <TableCell>Extracted Answers</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow key={index}>
                    <TableCell>{result.id}</TableCell>
                    <TableCell>{result.problem}</TableCell>
                    <TableCell>{result.true_answer}</TableCell>
                    <TableCell>{result.predicted_answer}</TableCell>
                    <TableCell>
                      {result.extracted_answers?.map(([answer, tokens, weight, method], i) => (
                        <div key={i}>
                          {answer}
                        </div>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default BatchInterface; 