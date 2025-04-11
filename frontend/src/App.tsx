import React, { useState } from 'react';
import { 
  Container, 
  Box, 
  Tabs, 
  Tab, 
  Typography,
  ThemeProvider,
  createTheme,
  CssBaseline
} from '@mui/material';
import ChatInterface from './components/ChatInterface';
import BatchInterface from './components/BatchInterface';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

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
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg">
        <Box sx={{ width: '100%', mt: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            Math QA Assistant
          </Typography>
          
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs 
              value={tabValue} 
              onChange={handleTabChange} 
              aria-label="basic tabs example"
              centered
            >
              <Tab label="Chat" />
              <Tab label="Batch Inference" />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            <ChatInterface />
          </TabPanel>
          
          <TabPanel value={tabValue} index={1}>
            <BatchInterface />
          </TabPanel>
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App; 