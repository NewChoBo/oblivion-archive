mergeInto(LibraryManager.library, {
  ArchiveInspectionEnabled: function () {
    return new URLSearchParams(window.location.search).get('inspect') === '1' ? 1 : 0;
  },
  ArchiveReportPose: function (x, y, z, yaw, pitch, phase, target, detail) {
    window.archivePose = Object.freeze({ x: x, y: y, z: z, yaw: yaw, pitch: pitch,
      phase: UTF8ToString(phase), target: UTF8ToString(target), detail:JSON.parse(UTF8ToString(detail)) });
  },
});
