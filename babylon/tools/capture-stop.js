new Promise((resolve) => {
  const capture = window.__ARCHIVE_RECORDER__;
  capture.recorder.onstop = () => {
    const blob = new Blob(capture.chunks, { type: 'video/webm' }),
      reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
    for (const track of capture.stream.getVideoTracks()) track.stop();
  };
  capture.recorder.stop();
});
