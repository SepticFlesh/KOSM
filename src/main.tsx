import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// StrictMode убран на время разработки — он вызывает двойной mount
// и может мешать инициализации WebGL-контекста и обработчиков ввода.
createRoot(document.getElementById('root')!).render(<App />);
