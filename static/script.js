const socket = io();
const username = prompt("Adınızı girin:");
socket.emit('register', { username });

let board = null;
let game = new Chess();
let myColor = null;
let isMyTurn = false;

// Tahta oluştur
function initBoard(fen) {
  board = Chessboard('board', {
    position: fen || 'start',
    draggable: true,
    orientation: myColor || 'white',
    onDragStart: (source, piece) => {
      if (!isMyTurn || game.game_over()) return false;
      if (myColor === 'white' && piece.startsWith('b')) return false;
      if (myColor === 'black' && piece.startsWith('w')) return false;
    },
    onDrop: (source, target) => {
      const move = game.move({ from: source, to: target, promotion: 'q' });
      if (move === null) return 'snapback';

      socket.emit('make_move', {
        move: source + target
      });
    }
  });
}

socket.on('color', (data) => {
  myColor = data.color;
  game.load(data.fen);
  isMyTurn = (data.turn === 'w' && myColor === 'white') || (data.turn === 'b' && myColor === 'black');

  document.getElementById('status').innerText = `Senin rengin: ${myColor}`;
  initBoard(data.fen);
});

socket.on('watch_mode', (data) => {
  myColor = 'white';  // izleyici beyaz gibi görür
  game.load(data.fen);
  document.getElementById('status').innerText = "Sadece izliyorsunuz.";
  initBoard(data.fen);
});

socket.on('move_made', (data) => {
  game.load(data.fen);
  board.position(data.fen);
  isMyTurn = (data.turn === 'w' && myColor === 'white') || (data.turn === 'b' && myColor === 'black');
});

socket.on('illegal_move', (data) => {
  alert(data.error);
  game.load(data.fen);
  board.position(data.fen);
});

socket.on('game_over', (data) => {
  alert(data.result || "Oyun sona erdi.");
});

socket.on('game_reset', (data) => {
  game.load(data.fen);
  board.position(data.fen);
  isMyTurn = (data.turn === 'w' && myColor === 'white') || (data.turn === 'b' && myColor === 'black');
});

socket.on('player_list', (data) => {
  const names = data.players.map(p => `${p.name} (${p.color})`).join(" | ");
  document.getElementById('players').innerText = "Oyuncular: " + names;
});

document.getElementById('restart-btn').addEventListener('click', () => {
  socket.emit('restart_game');
});
