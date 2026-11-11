export default function ErrorText({ error }) {
  if (!error) return null;
  return <p className="error">{error}</p>;
}
