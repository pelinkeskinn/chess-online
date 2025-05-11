from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room
import chess

app = Flask(__name__)
socketio = SocketIO(app)

# Global oyun durumu
board = chess.Board()
players = {}  # sid: 'white'/'black'
assigned = {'white': None, 'black': None}
usernames = {}  # sid -> username
move_history = []  # hamle geçmişi

@app.route('/')
def index():
    return render_template('index.html')

def update_player_list():
    player_list = []
    for sid, color in players.items():
        name = usernames.get(sid, 'Bilinmiyor')
        renk = 'beyaz' if color == 'white' else 'siyah'
        player_list.append({'name': name, 'color': renk})
    socketio.emit('player_list', {'players': player_list})

@socketio.on('register')
def handle_register(data):
    sid = request.sid
    username = data.get('username', f'Anonim-{sid[:5]}')
    usernames[sid] = username
    join_room('game')  # herkes aynı odada

    global board
    if assigned['white'] is None and assigned['black'] is None:
        board = chess.Board()
        move_history.clear()

    if sid in players:
        color = players[sid]
    elif assigned['white'] is None:
        color = 'white'
        players[sid] = color
        assigned['white'] = sid
    elif assigned['black'] is None:
        color = 'black'
        players[sid] = color
        assigned['black'] = sid
    else:
        emit('full', {'error': 'Oda dolu, izleyici moduna alındınız.'})
        emit('watch_mode', {
            'fen': board.fen(),
            'turn': 'w' if board.turn == chess.WHITE else 'b',
            'history': move_history
        }, room=sid)
        return

    emit('color', {
        'color': color,
        'fen': board.fen(),
        'turn': 'w' if board.turn == chess.WHITE else 'b',
        'username': username,
        'history': move_history
    }, room=sid)

    update_player_list()

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    if sid in players:
        role = players[sid]
        assigned[role] = None
        del players[sid]
    if sid in usernames:
        del usernames[sid]
    update_player_list()

@socketio.on('make_move')
def handle_move(data):
    sid = request.sid
    move_uci = data['move']

    if sid not in players:
        emit('illegal_move', {'error': 'Oyuncu tanınmadı.', 'fen': board.fen()}, room=sid)
        return

    player_color = players[sid]
    if (board.turn == chess.WHITE and player_color != 'white') or \
       (board.turn == chess.BLACK and player_color != 'black'):
        emit('illegal_move', {'error': 'Sıra sende değil!', 'fen': board.fen()}, room=sid)
        return

    legal_moves = [m.uci() for m in board.legal_moves]
    if move_uci not in legal_moves:
        emit('illegal_move', {'error': 'Geçersiz hamle', 'fen': board.fen()}, room=sid)
        return

    move = chess.Move.from_uci(move_uci)
    board.push(move)
    move_history.append({'uci': move_uci, 'fen': board.fen()})

    socketio.emit('move_made', {
        'move': move_uci,
        'fen': board.fen(),
        'turn': 'w' if board.turn == chess.WHITE else 'b',
        'history': move_history
    }, to='game')

    if board.is_game_over():
        if board.is_checkmate():
            loser_color = 'white' if board.turn == chess.WHITE else 'black'
            winner_sid = assigned['black'] if loser_color == 'white' else assigned['white']
            winner_name = usernames.get(winner_sid, 'Bilinmiyor')
            renk = 'beyaz' if players[winner_sid] == 'white' else 'siyah'
            socketio.emit('game_over', {'result': f"Kazanan: {winner_name} ({renk})"}, to='game')
        else:
            socketio.emit('game_over', {'result': f"Oyun bitti: {board.result()}"}, to='game')

@socketio.on('restart_game')
def restart_game():
    sid = request.sid
    if sid not in players:
        return  # sadece oyuncular oyunu başlatabilir

    global board
    board = chess.Board()
    move_history.clear()

    socketio.emit('game_reset', {
        'fen': board.fen(),
        'turn': 'w',
        'history': move_history
    }, to='game')

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, allow_unsafe_werkzeug=True)
