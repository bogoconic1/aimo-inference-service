import React, { useState, useMemo } from 'react';
import { 
  Container, 
  Box, 
  Typography,
  ThemeProvider,
  createTheme,
  CssBaseline,
  IconButton,
  useMediaQuery
} from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import BatchInterface from './components/BatchInterface';

function App() {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setMode] = useState<'light' | 'dark'>(prefersDarkMode ? 'dark' : 'light');

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: {
            main: mode === 'dark' ? '#90caf9' : '#1976d2',
          },
          secondary: {
            main: mode === 'dark' ? '#f48fb1' : '#dc004e',
          },
          background: {
            default: mode === 'dark' ? '#121212' : '#fff',
            paper: mode === 'dark' ? '#1e1e1e' : '#fff',
          },
        },
      }),
    [mode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg">
        <Box sx={{ width: '100%', mt: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
            <Typography variant="h4" component="h1">
              Math QA Batch Evaluation
            </Typography>
            <IconButton 
              onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
              color="inherit"
              sx={{ ml: 2 }}
              aria-label="toggle theme"
            >
              {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
          </Box>
          
          <Box sx={{ p: 3 }}>
            <BatchInterface />
          </Box>
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App; 