console.log('script.js yüklendi, Chessboard:', typeof Chessboard);

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let playerColor = null;
  let board = null;
  let currentTurn = 'white';
  let lastFen = '';
  let timer = null;
  let timeLeft = 30;

  const username = prompt("Lütfen kullanıcı adınızı girin:");
  socket.emit('register', { username });

  socket.on('color', data => {
    playerColor = data.color;
    currentTurn = data.turn === 'w' ? 'white' : 'black';
    lastFen = data.fen;

    const renkGoster = playerColor === 'white' ? 'beyaz' : 'siyah';
    alert(`Hoş geldin ${data.username}, senin rengin: ${renkGoster}`);

    board = Chessboard('board', {
      pieceTheme: '/static/chesspieces/{piece}.png',
      draggable: true,
      position: data.fen,
      orientation: playerColor,

      onDrop: (source, target, piece) => {
        let move = source + target;

        if ((piece === 'wP' && target[1] === '8') || (piece === 'bP' && target[1] === '1')) {
          move += 'q';
        }

        if (playerColor !== currentTurn) {
          alert('Sıra sende değil');
          return 'snapback';
        }

        if ((playerColor === 'white' && piece.startsWith('b')) ||
            (playerColor === 'black' && piece.startsWith('w')) ) {
          return 'snapback';
        }

        socket.emit('make_move', { move });
        return 'snapback';
      }
    });
  });

  socket.on('player_list', data => {
    const list = document.getElementById('players-list');
    list.innerHTML = '';
    data.players.forEach(p => {
      const renk = p.color === 'white' ? 'beyaz' : 'siyah';
      const item = document.createElement('li');
      item.textContent = `${p.name} (${renk})`;
      list.appendChild(item);
    });
  });

  socket.on('move_made', data => {
    if (board) {
      setTimeout(() => {
        board.position(data.fen);
        currentTurn = data.turn === 'w' ? 'white' : 'black';
        lastFen = data.fen;

        clearInterval(timer);
        timeLeft = 30;
        const countdownEl = document.getElementById('countdown');
        const gosterRenk = currentTurn === 'white' ? 'beyaz' : 'siyah';

        timer = setInterval(() => {
          countdownEl.textContent = `Sıra: ${gosterRenk} | Süre: ${timeLeft} saniye`;
          if (--timeLeft <= 0) {
            clearInterval(timer);
            alert(`${gosterRenk} süresi doldu!`);
          }
        }, 1000);
      }, 500);
    }
  });

  socket.on('illegal_move', data => {
    alert(data.error);
    if (board) board.position(data.fen || lastFen);
  });

  socket.on('game_over', data => {
    clearInterval(timer);
    alert('Oyun bitti! Sonuç: ' + data.result);
  });

  document.getElementById('restartBtn').addEventListener('click', () => {
    socket.emit('restart_game');
  });

  socket.on('game_reset', data => {
    board.position(data.fen);
    currentTurn = data.turn === 'w' ? 'white' : 'black';
    lastFen = data.fen;
    clearInterval(timer);
    alert('Oyun sıfırlandı!');
  });
});
