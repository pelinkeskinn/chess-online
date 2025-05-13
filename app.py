from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import chess

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Global kullanıcı adı takibi
usernames = {}        # sid -> kullanıcı adı
sid_room  = {}        # sid -> oda adı

# Oda bazlı durum
rooms = {}  # room_name -> {
            #   'board': chess.Board(),
            #   'players': { sid: 'white'/'black', … },
            #   'assigned': { 'white': sid or None, 'black': sid or None },
            #   'history': [ {san, fen}, … ]
            # }

def init_room(room):
    rooms[room] = {
        'board': chess.Board(),
        'players': {},
        'assigned': {'white': None, 'black': None},
        'history': []
    }

def update_player_list(room):
    lst = []
    for sid, color in rooms[room]['players'].items():
        name = usernames.get(sid, 'Bilinmiyor')
        renk = 'beyaz' if color == 'white' else 'siyah'
        lst.append({'name': name, 'color': renk})
    emit('player_list', {'players': lst}, room=room)

@app.route('/')
def login():
    return render_template('login.html')

@app.route('/game')
def game():
    return render_template('index.html')

@socketio.on('register')
def handle_register(data):
    sid      = request.sid
    username = data.get('username')
    room     = data.get('room', 'public')

    # İlk kez geldiyse oda yarat
    if room not in rooms:
        init_room(room)

    # Oda dolu mu?
    if len(rooms[room]['players']) >= 2:
        emit('room_full', {'error': 'Bu oda zaten dolu!'}, room=sid)
        return

    # Kaydet
    usernames[sid]  = username
    sid_room[sid]   = room
    rooms[room]['players'][sid] = None  # renk atanmamış placeholder

    join_room(room)

    # Renk ata
    assigned = rooms[room]['assigned']
    if assigned['white'] is None:
        color = 'white'
        assigned['white'] = sid
    else:
        color = 'black'
        assigned['black'] = sid

    rooms[room]['players'][sid] = color

    # İlk oyuncu geldiyse tahtayı sıfırla
    if len(rooms[room]['players']) == 1:
        rooms[room]['board'] = chess.Board()
        rooms[room]['history'].clear()

    # Renk bilgisini gönder
    emit('color', {
        'color': color,
        'fen': rooms[room]['board'].fen(),
        'turn': 'w' if rooms[room]['board'].turn == chess.WHITE else 'b',
        'username': username,
        'history': rooms[room]['history']
    }, room=sid)

    # Güncel listeyi odadakilere bildir
    update_player_list(room)

@socketio.on('make_move')
def handle_move(data):
    sid      = request.sid
    room     = sid_room.get(sid)
    board    = rooms[room]['board']
    move_san = data['move']

    # Sıra kontrolü
    player_color = rooms[room]['players'][sid]
    if (board.turn == chess.WHITE and player_color != 'white') or \
       (board.turn == chess.BLACK and player_color != 'black'):
        emit('illegal_move',
             {'error': 'Sıra sende değil!', 'fen': board.fen()},
             room=sid)
        return

    # Hamleyi dene
    try:
        mv = board.parse_san(move_san)
    except ValueError:
        emit('illegal_move',
             {'error': f'Geçersiz hamle: {move_san}', 'fen': board.fen()},
             room=sid)
        return

    if mv in board.legal_moves:
        board.push(mv)
        rooms[room]['history'].append({'san': move_san, 'fen': board.fen()})

        # Tüm odadakilere yayınla
        emit('move_made', {
            'move': move_san,
            'fen': board.fen(),
            'turn': 'w' if board.turn == chess.WHITE else 'b',
            'history': rooms[room]['history']
        }, room=room)

        # Oyun bitti mi?
        if board.is_game_over():
            if board.is_checkmate():
                loser = 'white' if board.turn == chess.WHITE else 'black'
                winner_sid = (rooms[room]['assigned']['black']
                              if loser == 'white'
                              else rooms[room]['assigned']['white'])
                winner_name = usernames.get(winner_sid, 'Bilinmiyor')
                renk = 'beyaz' if rooms[room]['players'][winner_sid] == 'white' else 'siyah'
                emit('game_over',
                     {'result': f'Kazanan: {winner_name} ({renk})'},
                     room=room)
            else:
                emit('game_over', {'result': board.result()}, room=room)
    else:
        emit('illegal_move',
             {'error': f'Geçersiz hamle: {move_san}', 'fen': board.fen()},
             room=sid)

@socketio.on('restart_game')
def restart_game():
    sid  = request.sid
    room = sid_room.get(sid)
    rooms[room]['board']   = chess.Board()
    rooms[room]['history'].clear()
    emit('game_reset', {
        'fen': rooms[room]['board'].fen(),
        'turn': 'w',
        'history': rooms[room]['history']
    }, room=room)

@socketio.on('time_out')
def handle_time_out(data):
    sid         = request.sid
    room        = sid_room.get(sid)
    loser_color = data.get('loserColor')
    winner_color = 'white' if loser_color == 'black' else 'black'
    winner_sid  = rooms[room]['assigned'][winner_color]

    emit('time_out', {'loserColor': loser_color}, room=room)

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    room = sid_room.pop(sid, None)
    usernames.pop(sid, None)
    if room and sid in rooms.get(room, {}).get('players', {}):
        rooms[room]['players'].pop(sid)
        # assigned’ten temizle
        for col, psid in rooms[room]['assigned'].items():
            if psid == sid:
                rooms[room]['assigned'][col] = None
        leave_room(room)
        update_player_list(room)

    if __name__ == 'main':
        socketio.run(app, host="0.0.0.0", port=5000, debug=True, allow_unsafe_werkzeug=True)