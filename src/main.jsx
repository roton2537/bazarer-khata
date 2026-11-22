import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './khai-khai.css';
import { initMonitor, reportError } from './lib/monitor.js';

initMonitor();
window.addEventListener('unhandledrejection', (e) => reportError(e.reason));

class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { reportError(error, { componentStack: info?.componentStack }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app no-nav"><section className="card stack" role="alert">
        <h1>কিছু একটা গোলমাল হয়েছে</h1>
        <p>আপনার লেখা হিসাব হারায়নি। পাতাটি নতুন করে খুলুন।</p>
        <button className="btn" onClick={() => window.location.reload()}>পাতা নতুন করে খুলুন</button>
      </section></main>
    );
  }
}

createRoot(document.getElementById('root')).render(<Boundary><App /></Boundary>);

// Install the offline shell even when push notifications are not configured.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* online mode continues */ });
  }, { once: true });
}

