const finishAtv = "FINALIZAR";
const code = window.location.href.split('/').slice(-1)[0]

const nameInput = $('#form-res input[type="number"]')
const tempoRestante = $("#tempoRestante")
const tentativas = $("#tentativas")
const timer = $("#timer")
const tries = $("#tries")

// TODO finish tries on screen

var startTime = null
var triesCount = null

nameInput.on( "focusout", function() {
  updateWeights()
})

function end() {  
  $.get(`${url}/status/${code}`, function (data) {
    startTime = data.startTime
    if(startTime)
      timer.removeClass("d-none")
    else
      timer.addClass("d-none")

    triesCount = data.tries
    if(typeof triesCount === 'number' && isFinite(triesCount))
      tries.removeClass("d-none")
    else
      tries.addClass("d-none")
    tentativas.text(triesCount)

    if (data.finished) window.location.replace(`${url}/finished`);
  }).fail(function (jqXHR, textStatus, errorThrown) {
    console.log(jqXHR.status)
    
  // window.location.replace(`${url}/test`);
  });
}

setInterval(end, 5000);

function finish() {
  var inputFinish = $("#validation").val();
  console.log(inputFinish)
  if (inputFinish == finishAtv) {
    $.ajax({
      url: `${url}/final-answer/${code}`,
      type: "PATCH",
      data: $("#form-res").serialize(),
      success: function (response) {
        window.location.replace(`${url}/finished`);
      },
      error: function (xhr, status, error) {
        alert("ocorreu um erro")
      },
    });
  }
  return false;
}


function updateWeights() {
  $.ajax({
    url: `${url}/update-weights/${code}`,
    type: "PATCH",
    data: $("#form-res").serialize(),
    success: function (response) {
    },
    error: function (xhr, status, error) {
      alert("ocorreu um erro")
    },
  });
}

function atualizarTempoRestanteFrontend() {
  if (!startTime)
    return;
  const elapsedTime = (Date.now() - startTime)// - pauseTime;

  const remainingTime = Math.max(0, (testDuration * 1000) - elapsedTime);

  const horas = Math.floor(remainingTime / testDuration * 1000);
  const minutos = Math.floor((remainingTime % testDuration * 1000) / 60000);
  const segundos = Math.floor((remainingTime % 60000) / 1000);

  const tempoFormatado = `${horas.toString().padStart(2, "0")}:${minutos
    .toString()
    .padStart(2, "0")}:${segundos.toString().padStart(2, "0")}`;

  tempoRestante.text(tempoFormatado);
}

setInterval(atualizarTempoRestanteFrontend, 1000);