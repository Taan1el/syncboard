import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/epilogue';
import '@fontsource-variable/karla';
import '@fontsource-variable/inconsolata';
import './styles/tokens.css';
import './App.css';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
