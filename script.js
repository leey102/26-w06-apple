const boardElement = document.querySelector("#board");
const timerElement = document.querySelector("#timer");
const timerProgressElement = document.querySelector("#timer-progress");
const scoreElement = document.querySelector("#score");
const bestScoreElement = document.querySelector("#best-score");
const statusElement = document.querySelector("#game-status");
const statusDotElement = document.querySelector("#status-dot");
const selectionTotalElement = document.querySelector("#selection-total");
const gameShellElement = document.querySelector(".game-shell");
const restartButton = document.querySelector("#restart");
const restartLabelElement = document.querySelector("#restart-label");
const confettiCanvas = document.querySelector("#flower-confetti");
const confettiContext = confettiCanvas.getContext("2d");

const boardSize = 8;
const initialTime = 60;
const bestScoreKey = "apple-sum-best-score";
const tones = ["red", "green", "gold", "blue"];

let numbers = [];
let selectedIndexes = [];
let selectionStartIndex = null;
let score = 0;
let bestScore = loadBestScore();
let secondsLeft = initialTime;
let timerId = null;
let activePointerId = null;
let isPlaying = false;
let confettiAnimationId = null;
let flowerParticles = [];

function loadBestScore() {
  try {
    const storedScore = Number.parseInt(localStorage.getItem(bestScoreKey), 10);
    return Number.isFinite(storedScore) && storedScore > 0 ? storedScore : 0;
  } catch {
    return 0;
  }
}

function saveBestScore() {
  try {
    localStorage.setItem(bestScoreKey, String(bestScore));
  } catch {
    // The score remains available for this game even if storage is unavailable.
  }
}

function createBoard() {
  return Array.from({ length: boardSize * boardSize }, () =>
    Math.floor(Math.random() * 9) + 1,
  );
}

function renderBoard(fallOffsets = new Map()) {
  const fragment = document.createDocumentFragment();

  numbers.forEach((number, index) => {
    const cell = document.createElement("button");
    const row = Math.floor(index / boardSize) + 1;
    const column = (index % boardSize) + 1;

    cell.className = "cell";
    cell.type = "button";
    cell.dataset.index = String(index);

    if (number === null) {
      cell.classList.add("is-empty");
      cell.disabled = true;
      cell.setAttribute("aria-label", `${row}행 ${column}열 빈 칸`);
    } else {
      const appleImage = document.createElement("img");
      const numberLabel = document.createElement("span");

      cell.classList.add("is-apple");
      appleImage.className = "apple-image";
      appleImage.src = "apple.svg";
      appleImage.alt = "";
      appleImage.setAttribute("aria-hidden", "true");
      numberLabel.className = "apple-label";
      numberLabel.textContent = String(number);
      cell.append(appleImage, numberLabel);
      cell.dataset.tone = tones[(number - 1) % tones.length];
      cell.setAttribute("aria-label", `${row}행 ${column}열 숫자 ${number}`);
      cell.disabled = !isPlaying;
    }

    fragment.append(cell);
  });

  boardElement.replaceChildren(fragment);

  fallOffsets.forEach((rowOffset, index) => {
    const cell = boardElement.querySelector(`[data-index="${index}"]`);
    if (!cell || rowOffset === 0) {
      return;
    }

    const rowStep = cell.getBoundingClientRect().height + Number.parseFloat(getComputedStyle(boardElement).rowGap);
    cell.animate(
      [
        { transform: `translateY(${rowOffset * rowStep}px)` },
        { transform: "translateY(0)" },
      ],
      { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  });
}

function renderScore() {
  scoreElement.textContent = score.toLocaleString("ko-KR");
  bestScoreElement.textContent = bestScore.toLocaleString("ko-KR");
}

function renderTimer() {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  timerElement.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  timerProgressElement.style.transform = `scaleX(${secondsLeft / initialTime})`;
  timerElement.classList.toggle("is-urgent", secondsLeft <= 10);
  timerProgressElement.classList.toggle("is-urgent", secondsLeft <= 10);
}

function updateSelectionDisplay() {
  const selectedNumbers = selectedIndexes.filter((index) => numbers[index] !== null);
  const sum = selectedNumbers.reduce((total, index) => total + numbers[index], 0);

  boardElement.querySelectorAll(".cell").forEach((cell) => {
    cell.classList.toggle("is-selected", selectedIndexes.includes(Number(cell.dataset.index)));
  });

  if (selectedIndexes.length === 0) {
    selectionTotalElement.textContent = "";
    statusDotElement.className = "status-dot";
    return sum;
  }

  selectionTotalElement.textContent = `합계 ${sum}`;
  statusElement.textContent = `${selectedNumbers.length}개 선택`;
  statusDotElement.className = sum > 0 && sum % 10 === 0 ? "status-dot is-active is-over" : "status-dot is-active";
  return sum;
}

function getCellAtPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  const cell = element?.closest(".cell");

  return cell && boardElement.contains(cell) ? Number(cell.dataset.index) : null;
}

function selectRectangle(endIndex) {
  if (selectionStartIndex === null || endIndex === null) {
    return;
  }

  const startRow = Math.floor(selectionStartIndex / boardSize);
  const startColumn = selectionStartIndex % boardSize;
  const endRow = Math.floor(endIndex / boardSize);
  const endColumn = endIndex % boardSize;
  const firstRow = Math.min(startRow, endRow);
  const lastRow = Math.max(startRow, endRow);
  const firstColumn = Math.min(startColumn, endColumn);
  const lastColumn = Math.max(startColumn, endColumn);

  selectedIndexes = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      selectedIndexes.push(row * boardSize + column);
    }
  }
  updateSelectionDisplay();
}

function clearSelection() {
  selectedIndexes = [];
  selectionStartIndex = null;
  updateSelectionDisplay();
}

function finishSelection() {
  const selectedSum = updateSelectionDisplay();

  const selectedNumberCount = selectedIndexes.filter((index) => numbers[index] !== null).length;
  if (selectedNumberCount > 1 && selectedSum > 0 && selectedSum % 10 === 0) {
    for (const index of selectedIndexes) {
      if (numbers[index] !== null) {
        numbers[index] = null;
      }
    }

    score += selectedSum;
    let isNewRecord = false;
    if (score > bestScore) {
      bestScore = score;
      isNewRecord = true;
      saveBestScore();
    }

    renderScore();
    statusElement.textContent = `+${selectedSum}점`;
    const fallOffsets = settleColumns();
    selectedIndexes = [];
    selectionStartIndex = null;
    renderBoard(fallOffsets);
    selectionTotalElement.textContent = "";
    statusDotElement.className = "status-dot is-active";
    if (isNewRecord) {
      startFlowerConfetti();
    }
    return;
  }

  clearSelection();
  statusElement.textContent = "다른 조합을 찾아보세요";
}

function settleColumns() {
  const fallOffsets = new Map();

  for (let column = 0; column < boardSize; column += 1) {
    const survivors = [];
    for (let row = 0; row < boardSize; row += 1) {
      const index = row * boardSize + column;
      if (numbers[index] !== null) {
        survivors.push({ number: numbers[index], row });
      }
    }

    const newNumberCount = boardSize - survivors.length;
    for (let row = 0; row < newNumberCount; row += 1) {
      const index = row * boardSize + column;
      numbers[index] = Math.floor(Math.random() * 9) + 1;
      fallOffsets.set(index, row - newNumberCount);
    }

    survivors.forEach(({ number, row }, survivorIndex) => {
      const targetRow = newNumberCount + survivorIndex;
      const index = targetRow * boardSize + column;
      numbers[index] = number;
      fallOffsets.set(index, row - targetRow);
    });
  }

  return fallOffsets;
}

function resizeConfettiCanvas() {
  const pixelRatio = window.devicePixelRatio || 1;
  confettiCanvas.width = Math.floor(window.innerWidth * pixelRatio);
  confettiCanvas.height = Math.floor(window.innerHeight * pixelRatio);
  confettiContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function drawFlower(context, particle) {
  context.save();
  context.translate(particle.x, particle.y);
  context.rotate(particle.rotation);
  context.fillStyle = particle.color;

  for (let petal = 0; petal < 5; petal += 1) {
    context.save();
    context.rotate((Math.PI * 2 * petal) / 5);
    context.beginPath();
    context.ellipse(0, -particle.size * 0.65, particle.size * 0.35, particle.size * 0.68, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  context.fillStyle = "#f6c953";
  context.beginPath();
  context.arc(0, 0, particle.size * 0.24, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function startFlowerConfetti() {
  if (!confettiContext || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  cancelAnimationFrame(confettiAnimationId);
  resizeConfettiCanvas();
  const colors = ["#ee6c77", "#f4a64e", "#b17acb", "#65ae82", "#65a9bd"];
  flowerParticles = Array.from({ length: 72 }, () => ({
    x: Math.random() * window.innerWidth,
    y: -Math.random() * window.innerHeight * 0.35,
    velocityX: (Math.random() - 0.5) * 2.4,
    velocityY: 1.5 + Math.random() * 3.2,
    size: 3 + Math.random() * 4,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.09,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  const startedAt = performance.now();
  const animateFlowers = (now) => {
    confettiContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
    flowerParticles = flowerParticles.filter((particle) => particle.y < window.innerHeight + 20);

    for (const particle of flowerParticles) {
      particle.x += particle.velocityX;
      particle.y += particle.velocityY;
      particle.rotation += particle.spin;
      drawFlower(confettiContext, particle);
    }

    if (now - startedAt < 3200 && flowerParticles.length > 0) {
      confettiAnimationId = requestAnimationFrame(animateFlowers);
    } else {
      confettiContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
      confettiAnimationId = null;
    }
  };

  confettiAnimationId = requestAnimationFrame(animateFlowers);
}

function finishGame() {
  isPlaying = false;
  clearInterval(timerId);
  timerId = null;
  activePointerId = null;
  clearSelection();
  renderBoard();
  gameShellElement.classList.add("is-finished");
  statusElement.textContent = "시간 종료";
  statusDotElement.className = "status-dot is-over";
}

function startTimer() {
  clearInterval(timerId);
  timerId = window.setInterval(() => {
    secondsLeft = Math.max(0, secondsLeft - 1);
    renderTimer();

    if (secondsLeft === 0) {
      finishGame();
    }
  }, 1000);
}

function startGame() {
  clearInterval(timerId);
  numbers = createBoard();
  selectedIndexes = [];
  selectionStartIndex = null;
  score = 0;
  secondsLeft = initialTime;
  activePointerId = null;
  isPlaying = true;
  restartButton.setAttribute("aria-label", "게임 다시 시작");
  restartLabelElement.textContent = "다시 시작";
  gameShellElement.classList.remove("is-finished");
  statusElement.textContent = "숫자를 선택하세요";
  statusDotElement.className = "status-dot";
  selectionTotalElement.textContent = "";
  renderScore();
  renderTimer();
  renderBoard();
  startTimer();
}

boardElement.addEventListener("pointerdown", (event) => {
  if (!isPlaying || !event.isPrimary || event.button !== 0) {
    return;
  }

  const index = Number(event.target.closest(".cell")?.dataset.index);
  if (!Number.isInteger(index) || numbers[index] === null) {
    return;
  }

  event.preventDefault();
  activePointerId = event.pointerId;
  selectionStartIndex = index;
  selectedIndexes = [index];
  boardElement.setPointerCapture(event.pointerId);
  updateSelectionDisplay();
});

boardElement.addEventListener("pointermove", (event) => {
  if (event.pointerId !== activePointerId) {
    return;
  }

  event.preventDefault();
  selectRectangle(getCellAtPoint(event.clientX, event.clientY));
});

boardElement.addEventListener("pointerup", (event) => {
  if (event.pointerId !== activePointerId) {
    return;
  }

  selectRectangle(getCellAtPoint(event.clientX, event.clientY));
  activePointerId = null;
  finishSelection();
});

boardElement.addEventListener("pointercancel", (event) => {
  if (event.pointerId !== activePointerId) {
    return;
  }

  activePointerId = null;
  clearSelection();
});

restartButton.addEventListener("click", startGame);

bestScoreElement.textContent = bestScore.toLocaleString("ko-KR");
numbers = createBoard();
renderBoard();
renderScore();
renderTimer();
window.addEventListener("resize", resizeConfettiCanvas);
resizeConfettiCanvas();