import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { TestRunViewer } from './pages/TestRunViewer';
import { DrawingViewer } from './pages/DrawingViewer';
import { Comparison } from './pages/Comparison';
import { Statistics } from './pages/Statistics';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Test Run Routes (New Primary Navigation) */}
        <Route path="/test-run/:testRunId" element={<TestRunViewer />} />

        {/* Legacy Drawing Routes (Keep for backward compatibility) */}
        <Route path="/drawing/:drawingId" element={<DrawingViewer />} />
        <Route path="/drawing/:drawingId/compare" element={<Comparison />} />
        <Route path="/drawing/:drawingId/stats" element={<Statistics />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
