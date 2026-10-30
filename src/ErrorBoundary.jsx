import { Component } from 'react';
import { Brand } from './brand.jsx';

export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main style={{maxWidth:520,margin:'12vh auto',padding:28}}><Brand/><h1 style={{fontSize:30,marginTop:32}}>Let’s get you back to your plan.</h1><p style={{lineHeight:1.7,color:'var(--pv-muted)'}}>This view could not open. Your saved data is still on this device.</p><button className="pv-button pv-primary" onClick={() => window.location.reload()}>Reload PrepVault</button></main>;
  }
}
