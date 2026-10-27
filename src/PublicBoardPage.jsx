import { Brand } from './brand.jsx';
import MessageBoard from './MessageBoard.jsx';
import './workspace.css';
import './inventory.css';
import './public-board.css';

export default function PublicBoardPage() {
  return <div className="pv-public-board">
    <a className="pv-skip" href="#public-board-main">Skip to community board</a>
    <header className="pv-public-board-header"><a href="/" aria-label="PrepVault home"><Brand /></a><a className="pv-inventory-button pv-inventory-button-secondary" href="/">Open PrepVault</a></header>
    <main id="public-board-main" tabIndex={-1}><MessageBoard standalone /></main>
    <footer className="pv-public-board-footer">PrepVault · A place to share practical preparation.</footer>
  </div>;
}
