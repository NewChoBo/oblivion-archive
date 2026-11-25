(() => {
  const stream = window.__ROOM_DEMO__.audioStream(),
    chunks = [],
    recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  window.__ARCHIVE_AUDIO__ = { recorder, chunks, started: performance.now() };
  recorder.start();
  return { recording: true };
})();
