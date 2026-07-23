export default function Nav() {
  return (
    <nav>
      <span className="brand">
        <img className="brand-mark" src="/favicon.svg" alt="" width="32" height="32" />
        relay<span className="cursor">▊</span>
      </span>
      <div className="nav-links">
        <a href="#why">why</a>
        <a href="#trust">trust</a>
        <a href="#how">how</a>
        <a href="#clis">clis</a>
        <a href="#proof">proof</a>
        <a href="#install">install</a>
        <a href="#activate">activate</a>
        <a href="#about">about</a>
        <a href="https://github.com/yoreai/relay" className="gh">
          github ↗
        </a>
      </div>
    </nav>
  );
}
