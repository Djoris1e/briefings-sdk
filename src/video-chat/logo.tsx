export function Logo() {
  return <img className="brand-logo" src={new URL("./assets/briefings-logo.svg", import.meta.url).href} alt="Briefings" width={144} height={36} />;
}
