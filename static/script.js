console.log('script.js yüklendi, Chessboard:', typeof Chessboard, 'Chess:', typeof Chess);

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let playerColor = null;
  let board = null;
  let game = null;
  let currentTurn = 'white';
  let timer, timeLeft = 30;

  const params = new URLSearchParams(window.location.search);
  const username = params.get("nick") || "Oyuncu";
  const room = params.get("room") || "public";

  const nameDisplay = document.getElementById("playerName");
  if (nameDisplay) nameDisplay.textContent = username;

  socket.emit('register', { username, room });

  socket.on('room_full', data => {
    alert(data.error);
    window.location.href = "/";
  });

  socket.on('color', data => {
    playerColor = data.color;
    currentTurn = data.turn === 'w' ? 'white' : 'black';

    game = new Chess();
    game.load(data.fen);

    const renk = playerColor === 'white' ? 'beyaz' : 'siyah';
    const alertBox = document.getElementById('welcomeAlert');
    const alertText = document.getElementById('alertText');
    alertText.innerHTML = `<strong style="color: #000">Rengin ${renk}</strong>`;
    alertBox.style.display = 'flex';

    setTimeout(() => {
      alertBox.style.display = 'none';
    }, 5000);

    board = Chessboard('board', {
      draggable: true,
      position: data.fen,
      orientation: playerColor,
      pieceTheme: '/static/chesspieces/{piece}.png',

      onDragStart: (source, piece) => {
        if (game.game_over()) return false;

        const isWhiteTurn = game.turn() === 'w';
        if ((isWhiteTurn && playerColor !== 'white') ||
            (!isWhiteTurn && playerColor !== 'black')) return false;

        if ((playerColor === 'white' && piece[0] !== 'w') ||
            (playerColor === 'black' && piece[0] !== 'b')) return false;

        return true;
      },

      onDrop: (source, target, piece) => {
        if ((game.turn() === 'w' && playerColor !== 'white') ||
            (game.turn() === 'b' && playerColor !== 'black')) {
          showCustomAlert('Sıra sende değil.');
          return 'snapback';
        }

        const promotion = ((piece === 'wP' && target[1] === '8') ||
                           (piece === 'bP' && target[1] === '1')) ? 'q' : undefined;

        const move = game.move({ from: source, to: target, promotion });

        if (move === null) {
          showCustomAlert('Geçersiz hamle!');
          return 'snapback';
        }

        socket.emit('make_move', { move: move.san });
        board.position(game.fen());

        resetTimer();
        updateStatus();
      },

      onSnapEnd: () => {
        board.position(game.fen());
      },

      onMouseoverSquare: highlightMoves,
      onMouseoutSquare: removeHighlights
    });

    window.addEventListener('resize', () => board && board.resize());
    setTimeout(() => board && board.resize(), 0);
  });

  socket.on('player_list', data => {
    const ul = document.getElementById('players-list');
    ul.innerHTML = '';
    data.players.forEach(p => {
      const li = document.createElement('li');
      li.textContent = `${p.name} (${p.color})`;
      ul.appendChild(li);
    });
  });

  socket.on('move_made', data => {
    game.load(data.fen);
    board.position(data.fen);
    currentTurn = data.turn === 'w' ? 'white' : 'black';
    resetTimer();
    updateStatus();
  });

  socket.on('illegal_move', data => {
    showCustomAlert(data.error);
    board.position(game.fen());
  });

  socket.on('game_over', data => {
    clearInterval(timer);
    showResultBox(data.result);
    updateStatus();
  });

  socket.on('game_reset', data => {
    hideResultBox();
    game.reset();
    game.load(data.fen);
    board.position(data.fen);
    currentTurn = data.turn === 'w' ? 'white' : 'black';
    resetTimer();
    updateStatus();
  });

  socket.on('time_out', data => {
    clearInterval(timer);

    const loserColor = data.loserColor;
    const winnerColor = loserColor === 'white' ? 'black' : 'white';
    const result = (playerColor === winnerColor) ? 'win' : 'lose';

    showResultBox(result);
    updateStatus();

    setTimeout(() => {
      hideResultBox();
      socket.emit('restart_game');
    }, 3000);
  });

  document.getElementById('restartBtn').addEventListener('click', () => {
    socket.emit('restart_game');
  });

  document.getElementById('result-restart').addEventListener('click', () => {
    hideResultBox();
    socket.emit('restart_game');
  });

  function resetTimer() {
    clearInterval(timer);
    timeLeft = 30;
    const el = document.getElementById('countdown');
    el.classList.remove('low-time');

    timer = setInterval(() => {
      if (timeLeft <= 5) {
        el.classList.add('low-time');
      } else {
        el.classList.remove('low-time');
      }

      el.textContent = `Sıra: ${currentTurn} | Süre: ${timeLeft}s`;

      if (--timeLeft < 0) {
        clearInterval(timer);
        socket.emit('time_out', { loserColor: currentTurn });
      }
    }, 1000);
  }

  function updateStatus() {
    const st = document.getElementById('status');
    if (game.in_checkmate()) st.textContent = 'Mat! Oyun bitti.';
    else if (game.in_draw()) st.textContent = 'Berabere!';
    else {
      st.textContent = `${currentTurn === 'white' ? 'Beyaz' : 'Siyah'} oynuyor` +
        (game.in_check() ? ' (şah çekildi!)' : '');
    }
  }

  function highlightMoves(square) {
    removeHighlights();

    if ((currentTurn === 'white' && playerColor !== 'white') ||
        (currentTurn === 'black' && playerColor !== 'black')) return;

    const piece = game.get(square);
    if (!piece || piece.color !== playerColor[0]) return;

    const moves = game.moves({ square, verbose: true });
    moves.forEach(m => {
      const el = document.querySelector(`.square-${m.to}`);
      if (el) el.classList.add('highlight-move');
    });

    const selectedSquare = document.querySelector(`.square-${square}`);
    if (selectedSquare) selectedSquare.classList.add('selected');
  }

  function removeHighlights() {
    document.querySelectorAll('.highlight-move, .selected')
      .forEach(el => el.classList.remove('highlight-move', 'selected'));
  }

  function showResultBox(result) {
    const box = document.getElementById('resultBox');
    const msg = document.getElementById('resultMessage');

    if (result === 'win') msg.textContent = 'Tebrikler! Kazandınız ⏳ (Süre bitti)';
    else if (result === 'lose') msg.textContent = 'Süreniz doldu, kaybettiniz 😞';
    else msg.textContent = 'Berabere 🤝';

    box.style.display = 'block';
  }

  function hideResultBox() {
    document.getElementById('resultBox').style.display = 'none';
  }

  function showCustomAlert(message) {
    const alertBox = document.getElementById('welcomeAlert');
    const alertText = document.getElementById('alertText');
    alertText.innerHTML = `<strong>${message}</strong>`;
    alertBox.style.display = 'flex';

    setTimeout(() => {
      alertBox.style.display = 'none';
    }, 4000);
  }
});
