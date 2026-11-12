import { Routes, Route } from 'react-router-dom';
import Projects from './routes/Projects';
import ProjectDetail from './routes/ProjectDetail';
export function App() {
  return (
    <Routes>
      <Route path="/projects" element={<Outlet />}>
        <Route index element={<Projects />} />
        <Route path=":projectId" element={<ProjectDetail />} />
      </Route>
    </Routes>
  );
}
