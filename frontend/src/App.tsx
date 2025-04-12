import React from 'react';
import { 
  Container, 
  Box, 
  Typography,
  ThemeProvider,
  createTheme,
  CssBaseline
} from '@mui/material';
import BatchInterface from './components/BatchInterface';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#f48fb1',
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg">
        <Box sx={{ width: '100%', mt: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            Math QA Batch Evaluation
          </Typography>
          
          <Box sx={{ p: 3 }}>
            <BatchInterface />
          </Box>
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App; 