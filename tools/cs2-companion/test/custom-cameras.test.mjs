import test from "node:test";
import assert from "node:assert/strict";
import { validateJob, recordingConfig, jobCameras } from "../job.mjs";
import { cameraSql, cleanupSql, CAMERA_MARK } from "../custom-cameras.mjs";

const base = {
  format: "tecmon-cs2-job",
  version: 1,
  title: "Frag",
  map: "de_mirage",
  tickRate: 64,
  branding: { enabled: false },
  sequences: [
    {
      startTick: 1000,
      endTick: 2000,
      steamId: "76561198000000000",
      playerName: "KOALA",
      cuts: [
        { tick: 1000, kind: "free", x: -1200.5, y: 300, z: 64, pitch: 12, yaw: 90 },
        { tick: 1400, kind: "player" },
      ],
    },
  ],
};

let n = 0;
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

test("Kamerapunkte werden zu CSDM-Kameras und Spieler-Schnitten", () => {
  const job = validateJob(base);
  const cameras = jobCameras(job, ids);
  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].name, "TecMon 1.1");
  const config = recordingConfig(job, "d.dem", "out", "1080p60", cameras);
  const seq = config.sequences[0];
  assert.deepEqual(seq.cameras, [{ tick: 1000, id: cameras[0].id, name: "TecMon 1.1", color: "#ffd23f" }]);
  assert.deepEqual(
    seq.playerCameras.map((c) => c.tick),
    [1400],
    "Start am Kamerapunkt, bei 1400 zum Spieler",
  );
});

test("Ohne Schnitte bleibt der Auftrag wie bisher", () => {
  const job = validateJob({ ...base, sequences: [{ ...base.sequences[0], cuts: undefined }] });
  assert.equal(job.sequences[0].cuts, undefined);
  const config = recordingConfig(job, "d.dem", "out", "720p");
  assert.deepEqual(config.sequences[0].cameras, []);
  assert.equal(config.sequences[0].playerCameras.length, 1);
});

test("Ungültige Schnitte werden abgelehnt", () => {
  const seq = base.sequences[0];
  for (const cuts of [
    "x",
    [{ tick: 999, kind: "player" }],
    [{ tick: 2000, kind: "player" }],
    [{ tick: 1500, kind: "player" }, { tick: 1200, kind: "player" }],
    [{ tick: 1200, kind: "free", x: 0, y: 0, z: 0, pitch: 120, yaw: 0 }],
    [{ tick: 1200, kind: "free", x: "1;quit", y: 0, z: 0, pitch: 0, yaw: 0 }],
    [{ tick: 1200, kind: "exec" }],
    Array.from({ length: 13 }, (_, i) => ({ tick: 1000 + i, kind: "player" })),
  ])
    assert.throws(() => validateJob({ ...base, sequences: [{ ...seq, cuts }] }), JSON.stringify(cuts));
});

test("SQL enthält nur geprüfte Werte und räumt eigene Punkte auf", () => {
  const job = validateJob(base);
  const sql = cameraSql(job.map, jobCameras(job, ids));
  assert.match(sql, /DELETE FROM cameras WHERE comment = 'tecmon-companion'/);
  assert.match(sql, /'CS2','TecMon 1\.1','de_mirage',-1200\.5,300,64,12,90,'tecmon-companion'/);
  assert.throws(() => cameraSql("de_mirage'; DROP TABLE demos;--", []));
  assert.throws(() => cameraSql("de_mirage", [{ id: "x", name: "TecMon 1.1", x: 0, y: 0, z: 0, pitch: 0, yaw: 0 }]));
  assert.equal(cleanupSql(), `DELETE FROM cameras WHERE comment = '${CAMERA_MARK}';\n`);
});
