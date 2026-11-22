const { files, run } = require("./test-flood-warning-v2-phase1");
run([...files, "tests/flood-warning-v2.geometry.test.js", "tests/flood-warning-v2.zones.test.js",
  "tests/flood-warning-v2.evaluation.test.js", "tests/flood-warning-v2.devices.test.js",
  "tests/flood-warning-v2.worker.test.js", "tests/flood-warning-v2.scheduler.test.js"]);
