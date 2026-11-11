import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Wraps the browser's built-in speech-to-text (Web Speech API).
 * Works in Chrome, Edge and Safari (desktop + mobile). Not in Firefox - there `supported` is false
 * and the user can type instead. Note: Chrome sends the audio to Google's servers to transcribe it.
 *
 * onFinal(text) is called once the user stops talking.
 */
export default function useSpeechRecognition({ lang = 'en-SG', onFinal } = {}) {
  const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  });

  useEffect(() => () => recRef.current?.abort(), []);

  const start = useCallback(() => {
    if (!Recognition) return;
    recRef.current?.abort();
    const rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';

    rec.onresult = (event) => {
      let interim = '';
      finalText = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setTranscript((finalText + interim).trim());
    };
    rec.onerror = (event) => {
      const messages = {
        'not-allowed': 'Microphone permission was denied. Allow it in your browser settings.',
        'no-speech': "Didn't hear anything - try again.",
        network: 'Speech recognition needs an internet connection.',
      };
      if (event.error !== 'aborted') setError(messages[event.error] || `Speech error: ${event.error}`);
    };
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) onFinalRef.current?.(finalText.trim());
    };

    setError('');
    setTranscript('');
    setListening(true);
    recRef.current = rec;
    rec.start();
  }, [Recognition, lang]);

  const stop = useCallback(() => recRef.current?.stop(), []);

  return { supported: Boolean(Recognition), listening, transcript, setTranscript, error, start, stop };
}
