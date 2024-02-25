import Docker from "dockerode";
import fs from "fs";
import path from "path";
import { load } from "cheerio";

const ignoreWords = ["しています", "お", "な", "や", "が", "の", "は", "を"];

interface Alternative {
  text: string;
}

type Conjugation = [
  | {
      reading: string;
      gloss: [];
    }
  | undefined
];
type Word = [
  eng: string,
  { text: string; conj?: Conjugation; alternative?: [Alternative] }
];
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

function getWords(input: IchiranResultType): string[] {
  const result: string[] = [];

  input.forEach((r) => {
    if (Array.isArray(r)) {
      const words = r[0][0];

      words.forEach((word) => {
        const reading = word[1].conj?.[0]?.reading;
        const dictForm = reading?.slice(0, reading.indexOf("【"));

        const wordResult =
          dictForm || word[1].text || word[1]?.alternative?.[0].text;

        wordResult && result.push(wordResult);
      });
    }
  });

  return result;
}

function getLines(html: string): string[] {
  const $ = load(html);

  const table = $("tbody");

  // newer <table> based
  if (table.length) {
    return table
      .children()
      .toArray()
      .map((el) => load(el).text());
  } else {
    // older <p> based
    return $("p")
      .toArray()
      .map((el) => load(el).text());
  }
}

/**
 * Get env list from running container
 * @param container
 */
function runExec(container: Docker.Container) {
  const transcriptsPath = path.resolve(
    "./nihongothatsdan-transcripts/transcripts/"
  );
  const allTranscripts = fs
    .readdirSync(transcriptsPath)
    .map((path) =>
      fs.readFileSync(`${transcriptsPath}/${path}`).toString("utf8")
    );

  let failures = 0;

  Promise.all(
    allTranscripts.slice(allTranscripts.length - 10).map((transcHTML) => {
      return Promise.all(
        getLines(transcHTML).map((line) => {
          var options = {
            Cmd: ["ichiran-cli", "-f", line],
            AttachStdout: true,
            AttachStderr: true,
          };

          return container.exec(options).then((exec) => {
            if (!exec) return;

            return exec.start().then((stream) => {
              return streamToString(stream).then((s) => {
                try {
                  const result = JSON.parse(
                    s.slice(8) //?????
                  ) as IchiranResultType;

                  return getWords(result).filter(
                    (word) => !ignoreWords.includes(word)
                  );
                } catch (e) {
                  // lol invalid json good tool
                  failures++;
                }
              });
            });
          });
        })
      );
    })
  ).then((transcripts) => {
    console.log("done extracting vocab with", failures, "failures");
    const allVocab: { [word: string]: number } = {};

    for (const transcript of transcripts) {
      if (!transcript) return;

      for (const line of transcript) {
        if (!line) return;

        for (const word of line) {
          allVocab[word] = (allVocab[word] || 0) + 1;
        }
      }
    }

    console.log("done")
    console.log(allVocab);
  });
}

const container = docker.getContainer("cfff0cd5caa0");
runExec(container);
