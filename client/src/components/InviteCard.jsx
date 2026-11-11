import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api.js';

// QR code + share link so the rest of the table can join without typing the lobby password.
export default function InviteCard({ lobby }) {
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getInvite(lobby.id)
      .then(async ({ code }) => {
        const url = `${window.location.origin}/join/${lobby.id}/${code}`;
        const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 });
        if (!cancelled) {
          setLink(url);
          setQr(dataUrl);
        }
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [lobby.id]);

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: `Join ${lobby.name}`, url: link }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (error) return <p className="error">{error}</p>;
  if (!link) return null;
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  return (
    <section className="card invite">
      <h2>Invite players</h2>
      <p className="muted small">Scan to join{lobby.hasPassword ? ' (no password needed)' : ''}.</p>
      <img src={qr} alt="QR code to join this lobby" width="240" height="240" />
      <button className="btn-secondary" onClick={share}>{copied ? 'Link copied' : 'Share link'}</button>
      {isLocalhost && (
        <p className="muted small">
          This link uses localhost, so phones can't open it. Open the app with your computer's network address instead
          (see "Testing on phones" in the README).
        </p>
      )}
    </section>
  );
}
