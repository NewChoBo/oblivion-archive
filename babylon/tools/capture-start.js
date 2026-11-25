(() => {
  const canvas = document.getElementById('game'),
    audio = window.__ROOM_DEMO__.audioStream();
  const stream = new MediaStream([
    ...canvas.captureStream(18).getVideoTracks(),
    ...(audio?.getAudioTracks() || []),
  ]);
  const chunks = [],
    recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9,opus',
      videoBitsPerSecond: 1400000,
    });
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.start();
  window.__ARCHIVE_RECORDER__ = { recorder, chunks, stream };
  return { recording: true, audioTracks: audio?.getAudioTracks().length || 0 };
})();
