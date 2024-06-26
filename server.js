const express = require("express");
const fs = require('fs');
const bodyParser = require("body-parser");
const ExcelJS = require("exceljs");
const cors = require("cors");
const { createProxyMiddleware } = require('http-proxy-middleware');
const { shuffle } = require('./utils');
const { restart } = require("nodemon");
require("dotenv").config();

const data = { url: process.env.CURR_IP };

const app = express();

app.use(cors({ origin: "*" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.set("views", "./src/views");
app.set("view engine", "ejs");

app.use(express.static("public"));

var started = false;
var competitors = {};
var testWeights = [100, 200, 500];
var weights = [100, 200, 300, 500, 800];
var showTimer = false
var showTries = false
var reset = false
var testDuration = 3600

app.post("/ready", async (req, res) => {
  const { name, dataNasc, w1, w2, w3, w4, w5 } = req.body;
  if(!dataNasc)
    return res.status(400).send("Sem data de nascimento")

  let accessed = false;
  let done = false;
  let time = "";

  let score = {
    w1: w1 || weights[2],
    w2: w2 || 0,
    w3: w3 || 0,
    w4: w4 || 0,
    w5: w5 || 0,
  };

  let realWeights = [0, 1, 3, 4]
  shuffle(realWeights)

  let realScore = [
    2,
    realWeights[0],
    realWeights[1],
    realWeights[2],
    realWeights[3]
  ];

  let tentativas = 0;
  let pieces = 0;

  let code = await generate();

  competitors[code] = { name, dataNasc, done, time, realScore, ...score, tentativas, pieces, code, accessed };
  console.log("Novo jogador:", code, name, realScore)

  res.send({ message: "Dados recebidos com sucesso!", code: code });
});

app.patch("/update-weights/:code", (req, res) => {
  const { code } = req.params;
  const { w1, w2, w3, w4, w5 } = req.body;

  if (!competitors[code]) {
    return res.status(404).send("Competidor não encontrado.");
  }

  competitors[code].w1 = w1 || competitors[code].w1;
  competitors[code].w2 = w2 || competitors[code].w2;
  competitors[code].w3 = w3 || competitors[code].w3;
  competitors[code].w4 = w4 || competitors[code].w4;
  competitors[code].w5 = w5 || competitors[code].w5;

  res.send("OK");
});

app.patch("/final-answer/:code", (req, res) => {
  const { code } = req.params;
  const { w1, w2, w3, w4, w5 } = req.body;

  if (!competitors[code]) {
    return res.status(404).send("Competidor não encontrado.");
  }

  competitors[code].w1 = w1 || competitors[code].w1;
  competitors[code].w2 = w2 || competitors[code].w2;
  competitors[code].w3 = w3 || competitors[code].w3;
  competitors[code].w4 = w4 || competitors[code].w4;
  competitors[code].w5 = w5 || competitors[code].w5;

  competitors[code].done = true;

  const elapsedTime = Date.now() - startTime;

  const hours = Math.floor(elapsedTime / 3600000);
  const minutes = Math.floor((elapsedTime % 3600000) / 60000);
  const seconds = Math.floor((elapsedTime % 60000) / 1000);

  competitors[code].time = `${hours}:${minutes}:${seconds}`;

  res.send("OK");
});

app.post("/testscales", (req, res) => {
  let { quantities } = req.body;

  if (!quantities) return res.status(400).send({ message: "vazio" });
  
  let temp = [testWeights[2], testWeights[0], testWeights[1]]
  let results = []
  for (let i = 0; i < quantities.length; i++) {
    const bal = quantities[i];
    let plate1 = 0;
    let plate2 = 0;
    
    for (let j = 0; j < 3; j++) {
      plate1 += bal[j] * temp[j];
      plate2 += bal[j + 5] * temp[j];
    }

    if (plate1 > plate2) results.push(-1);
    else if (plate1 === plate2) results.push(0);
    else results.push(1);
  }

  res.send({ results });
});

app.post("/scales/:code", (req, res) => {
  const { code } = req.params;
  let { quantities } = req.body;

  if (!competitors[code]) {
    return res.status(404).send("Competidor não encontrado.");
  }

  if (!quantities) return res.status(400).send({ message: "vazio" });

  competitors[code].tentativas += 1;
  competitors[code].pieces = 0;

  let results = []
  for (let i = 0; i < quantities.length; i++) {
    const bal = quantities[i];
    let plate1 = 0;
    let plate2 = 0;

    let temp = [
      competitors[code].realScore[1],
      competitors[code].realScore[2],
      competitors[code].realScore[0],
      competitors[code].realScore[4],
      competitors[code].realScore[3],
    ]

    for (let j = 0; j < 5; j++) {
      plate1 += bal[j] * weights[temp[j]];
      plate2 += bal[j+5] * weights[temp[j]];
      competitors[code].pieces += bal[j] + bal[j+5];
    }

    if (plate1 > plate2) results.push(-1);
    else if (plate1 === plate2) results.push(0);
    else results.push(1);
  }

  res.send({ results });
});

app.get("/competitors", (req, res) => {
  res.json(competitors);
});

let startTime = null;
let timer;
let startPause;
let pauseTime = 0;

var finished = false;

app.post("/start-timer", (req, res) => {
  if (timer) {
    return res.send({startTime: startTime, message: "O cronômetro já está em execução."});
  }

  startTime = Date.now();
  reset = false

  timer = setTimeout(() => {
    console.log("Tempo encerrado.");
    finished = true;
    saveExcel();
    clearInterval(timer)
  }, testDuration * 1000);

  started = true;
  res.send({startTime: startTime, message: "Cronômetro de 1 hora iniciado."});
});

app.get("/pause-timer", (req, res) => {
  if (startPause) {
    pauseTime += Date.now() - startPause
    startPause = null
    return res.send({pauseTime: pauseTime, paused: false});
  }

  startPause = Date.now();

  res.send({pauseTime: pauseTime, paused: true});
});

app.get("/check-timer", (req, res) => {
  if (!timer) {
    return res.status(409).send("O cronômetro não está em execução.");
  }

  var elapsedTime = (Date.now() - startTime) - pauseTime;
  if (startPause) {
    elapsedTime -= Date.now() - startPause
  }

  const remainingTime = Math.max(0, (testDuration * 1000) - elapsedTime);

  const hours = Math.floor(remainingTime / testDuration * 1000);
  const minutes = Math.floor((remainingTime % testDuration * 1000) / 60000);
  const seconds = Math.floor((remainingTime % 60000) / 1000);

  if (hours > 0)
    return res.send({startTime: startTime, leftTime: `00:${minutes}:${seconds}`, paused: startPause ? true : false});
  return res.send({startTime: startTime, leftTime: `${hours}:${minutes}:${seconds}`, paused: startPause ? true : false});
});

app.get("/finish", async (req, res) => {
  function formatTime(milliseconds) {
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor((milliseconds % 3600000) / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${hours}:${minutes}:${seconds}`;
  }

  for (const code in competitors) {
    if (competitors.hasOwnProperty(code)) {
      const competitor = competitors[code];
      if (!competitor.time) {
        const elapsedTime = Date.now() - startTime;
        competitor.time = formatTime(elapsedTime);
      }
    }
  }
  
  finished = true;
  startTime = null
  try {
    var filename = await saveExcel();
    return res.download("./" + filename, filename)
  } catch (error) {
    return res.status(500).send("Atividade finalizada, porém, o excel falhou.");
  }
});

app.post("/reset", (req, res) => {
  started = false
  startTime = null
  timer = null
  startPause = null
  pauseTime = 0
  finished = false
  competitors = {}
  testDuration = 3600

  reset = true

  res.send("Atividade finalizada.");
});

app.post("/setOptions", (req, res) => {
  const { timer, tries } = req.body;
  showTimer = timer == "on";
  showTries = tries == "on";

  res.send({showTimer, showTries});
});

app.get("/status/:code", (req, res) => {
  const { code } = req.params;
  var comp = competitors[code]
  if (!comp) {
    return res.status(404).send({success: false, error: {message: "Competidor não encontrado."}});
  }

  res.send({finished: finished, startTime: showTimer ? startTime : null, tries: showTries ? comp.tentativas : null, reset});
});


app.post("/set-time", (req, res) => {
  const { time } = req.body;
  if (typeof testDuration != 'number')
    return res.status(400).send("Valor inválido")
  testDuration = Number(time)
  console.log("Novo tempo de prova:", testDuration)
  return res.send({testDuration})
})

app.post("/set-weigths/:target", (req, res) => {
  const { w1, w2, w3, w4, w5 } = req.body;
  const { target } = req.params;  
  
  if (target == "test")
  {
    testWeights[1] = Number(w1) || testWeights[1];
    testWeights[0] = Number(w2) || testWeights[0];
    testWeights[2] = Number(w3) || testWeights[2];
    console.log("Pesos do teste atualizados para:", weights)
    return res.send("Pesos do test atualizados");
  }
  if (target == "game")
  {
    weights[2] = Number(w1) || weights[2];
    weights[0] = Number(w2) || weights[0];
    weights[1] = Number(w3) || weights[1];
    weights[3] = Number(w4) || weights[3];
    weights[4] = Number(w5) || weights[4];
    console.log("Pesos do jogo atualizados para:", weights)
    return res.send("Pesos do jogo atualizados");
  }
  
  return res.send("Inválido")
});

app.get("/game/:code", (req, res) => {
  const { code } = req.params;
  if (!competitors[code])
    return res.render("Error", {title: "Não encontrado", message: "Jogador não encontrado"});
  if (competitors[code].accessed) {
    return res.render("Error", {title: "Já Acessado", message: "Solicite ajuda de um dos instrutores da avaliação"});
  }
  competitors[code].accessed = true

  res.render("Game", { data: data, defaultWeigth: weights[2], code, showTimer, showTries, testDuration });
});
app.get("/test", (req, res) => {
  res.render("Test", { data: data, defaultWeigth: testWeights[1] });
});
app.get("/dashboard", (req, res) => {
  res.render("Dashboard", { data: competitors, url: data.url, startTime, currWeigths: {weights, testWeights}, showTimer, showTries, testDuration });
});
app.get("/finished", (req, res) => {
  res.render("Finished");
});
app.get("/started", (req, res) => {
  res.send(started);
});

app.use((req, res, next) => {
  res.status(404).render("Error", { title: "Erro 404", message: "Página não encontrada" });
});

app.use((req, res, next) => {
  console.log("Dados recebidos:", req.body);
  next();
});

async function saveExcel() {
  const today = new Date();
  const hour = today.getHours();
  const dateFormatted = today.toISOString().slice(0, 10).replace(/-/g, '');

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Alunos");

  const headerRow = worksheet.addRow([
    "Nome",
    "Data de Nascimento",
    "Concluiu",
    "Tempo",
    "Tentativas",
    "N Peças",
    "Peso 1",
    "Peso 2",
    "Peso 3",
    "Peso 4",
    "Peso 5",
    "R1",
    "R2",
    "R3",
    "R4",
    "R5"
  ]);

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFA0A0A0' } // Cinza
    };
    cell.font = {
      color: { argb: 'FFFFFFFF' } // Branco
    };
  });

  for (const key in competitors) {
    if (Object.hasOwnProperty.call(competitors, key)) {
      const competitor = competitors[key];
      const row = worksheet.addRow([
        competitor.name,
        competitor.dataNasc,
        competitor.done,
        competitor.time,
        competitor.tentativas,
        competitor.pieces,
        competitor.w1,
        competitor.w2,
        competitor.w3,
        competitor.w4,
        competitor.w5,
        weights[competitor.realScore[0]],
        weights[competitor.realScore[1]],
        weights[competitor.realScore[2]],
        weights[competitor.realScore[3]],
        weights[competitor.realScore[4]]
      ]);

      [competitor.w1, competitor.w2, competitor.w3, competitor.w4, competitor.w5].forEach((weight, index) => {
        const cell = row.getCell(index + 7); 

        if (weight == weights[competitor.realScore[index]]) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF00FF00' } // Verde
          };
        } else {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF0000' } // Vermelho
          };
        }
      });
    }
  }

  let fileName;
  let count = 1;

  
  do {
    if (hour < 12) {
      fileName = `processo_manha${count}_${dateFormatted}.xlsx`;
    } else {
      fileName = `processo_tarde${count}_${dateFormatted}.xlsx`;
    }
    
    count++;
  } while (fs.existsSync(fileName));
  
  await workbook.xlsx.writeFile(fileName);
  console.log(`Planilha salva em ${fileName}`);
  return fileName
}


async function generate() {
  let secretcode = "";
  const characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    secretcode += characters.charAt(randomIndex);
  }

  return secretcode;
}

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`${process.env.CURR_IP}/test`);
  console.log(`${process.env.CURR_IP}/dashboard`);
});
