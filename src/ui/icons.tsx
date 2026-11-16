// Small inline icons for things no emoji covers.

/** A miner's gold pan: a shallow steel dish with a few flecks of gold in the bottom. */
export function PanIcon({ size = '1em' }: { size?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ verticalAlign: '-0.15em' }}>
      {/* outer wall, seen slightly from above */}
      <path d="M1.5 10.5 C2.5 15.5 6 17.5 12 17.5 C18 17.5 21.5 15.5 22.5 10.5 Z" fill="#6b727a" />
      <path d="M1.5 10.5 C2.5 15.5 6 17.5 12 17.5 C18 17.5 21.5 15.5 22.5 10.5" fill="none" stroke="#2b2f35" strokeWidth="0.8" />
      {/* rim and the dark inside of the pan */}
      <ellipse cx="12" cy="10.5" rx="10.5" ry="3.6" fill="#9aa1a8" />
      <ellipse cx="12" cy="10.7" rx="9" ry="2.8" fill="#2f343a" />
      {/* black sand and gold settled in the bottom */}
      <ellipse cx="12" cy="11.4" rx="5" ry="1.4" fill="#1b1d21" />
      <circle cx="10" cy="11.3" r="1.1" fill="#f2c14e" />
      <circle cx="13.2" cy="11.7" r="1.3" fill="#ffd866" />
      <circle cx="11.7" cy="10.6" r="0.7" fill="#f2c14e" />
      <circle cx="15" cy="10.9" r="0.6" fill="#e0a830" />
    </svg>
  );
}
