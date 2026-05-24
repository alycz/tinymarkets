import ReactDOM from 'react-dom/client';
import App from './App.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('No #root element');
ReactDOM.createRoot(rootEl).render(<App />);
