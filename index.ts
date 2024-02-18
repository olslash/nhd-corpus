import Docker from "dockerode";

type Conjugation = [
  | {
      reading: string;
      gloss: [];
    }
  | undefined
];
type Word = [eng: string, { text: string; conj?: Conjugation, alternative?: [{
    text: string
}] }];
type IchiranResultType = (string | [[Word[]]])[];

var docker = new Docker({
  socketPath: "/var/run/docker.sock",
});

function streamToString(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

/**
 * Get env list from running container
 * @param container
 */
function runExec(container) {
  var options = {
    Cmd: [
      "ichiran-cli",
      "-f",
      "このチャンネルは仲良し夫婦のたつやとちよしが、日々の何気ない会話、雑談を通して自然な日常日本語会話をお伝えしています",
    ],
    AttachStdout: true,
    AttachStderr: true,
  };

  container.exec(options, function (err, exec) {
    if (err) return;
    exec.start(function (err, stream) {
      if (err) return;

      const s = streamToString(stream).then((s) => {
        const result = JSON.parse(
          s.slice(8) //?????
        ) as IchiranResultType;

        result.forEach((r) => {
          if (Array.isArray(r)) {
            const words = r[0][0];

            words.forEach((word) => {
              const reading = word[1].conj?.[0]?.reading;
              const dictForm = reading?.slice(0, reading.indexOf("【"));

              console.log(dictForm || word[1].text);

              if (!dictForm && !word[1].text) {
                console.log(word[1]?.alternative[0].text);
              }
            });
          }
        });
      });
    });
  });
}

const container = docker.getContainer("cfff0cd5caa0");
runExec(container);
