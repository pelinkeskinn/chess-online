console.log("login.js yüklendi!");
document.addEventListener("DOMContentLoaded", () => {
  const loginBtn      = document.getElementById("loginBtn");
  const nicknameInput = document.getElementById("nickname");
  const roomInput     = document.getElementById("room");

  function doLogin() {
    const nickname = nicknameInput.value.trim();
    let   room     = roomInput.value.trim();

    // takma ad zorunlu
    if (!nickname) {
      alert("Lütfen adınızı girin.");
      nicknameInput.focus();
      return;
    }

    // oda boşsa public
    if (!room) {
      room = "public";
    } else {
      // regex kontrolü: 3–8 alfanumerik
      const valid = /^[A-Za-z0-9]{3,8}$/.test(room);
      if (!valid) {
        alert("Oda adı 3–8 karakter arası, sadece harf ve rakam olabilir.");
        roomInput.focus();
        return;
      }
    }

    // yönlendirme
    window.location.href =
      '/game?nick=${encodeURIComponent(nickname)}&room=${encodeURIComponent(room)}';
  }

  loginBtn.addEventListener("click", doLogin);
  nicknameInput.addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });
  roomInput.addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });
});