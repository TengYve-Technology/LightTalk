(() => {
  const doc = document;
  const win = window;
  let currentUser = null;
  let currentRoom = "lobby";
  let eventSource = null;
  let messageOffset = 0;
  let isLoading = false;
  let replyTo = null;
  let emojis = ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","😈","😉","😊","😋","😌","😍","😎","😏","😐","😑","😒","😓","😔","😕","😖","😗","😘","😙","😚","😛","😜","😝","😞","😟","😠","😡","😢","😣","😤","😥","😦","😧","😨","😩","😪","😫","😬","😭","😮","😯","😰","😱","😲","😳","😴","😵","😶","😷","😸","😹","😺","😻","😼","😽","😾","😿","🙀","🙁","🙂","🙃","🙄","🙅","🙆","🙇","🙈","🙉","🙊","🙋","🙌","🙍","🙎","🙏"];

  // DOM elements
  const els = {};
  function $(id) { return doc.getElementById(id); }
  function $$(sel) { return doc.querySelector(sel); }
  function $$$(sel) { return doc.querySelectorAll(sel); }
  
  // Initialization
  function init() {
    cacheDOM();
    setupEventListeners();
    checkAuthState();
  }

  function cacheDOM() {
    els.authModal = $("auth-modal");
    els.app = $("app");
    els.loginForm = $("login-form-element");
    els.registerForm = $("register-form-element");
    els.loginError = $("login-error");
    els.registerError = $("register-error");
    els.createRoomModal = $("create-room-modal");
    els.imageModal = $("image-modal");
    els.contextMenu = $("context-menu");
    els.userAvatar = $("user-avatar");
    els.currentRoomIcon = $("current-room-icon");
    els.currentRoomName = $("current-room-name");
    els.roomStatus = $("room-status");
    els.messages = $("messages");
    els.messageInput = $("message-input");
    els.messageForm = $("message-form");
    els.replyPreview = $("reply-preview");
    els.replyPreviewText = $("reply-preview-text");
    els.cancelReply = $("cancel-reply");
    els.roomList = $("room-list");
    els.userList = $("user-list");
    els.userSearch = $("user-search");
    els.lobbyCount = $("lobby-count");
    els.emojiPicker = $("emoji-picker");
    els.emojiBtn = $("emoji-btn");
    els.attachBtn = $("attach-btn");
    els.fileInput = $("file-input");
    els.avatarInput = $("avatar-input");
    els.changeAvatarBtn = $("change-avatar-btn");
    els.saveProfileBtn = $("save-profile-btn");
    els.settingsDisplayName = $("settings-displayName");
    els.currentPassword = $("current-password");
    els.newPassword = $("new-password");
    els.confirmNewPassword = $("confirm-new-password");
    els.changePasswordBtn = $("change-password-btn");
    els.logoutBtn = $("logout-btn");
    els.createRoomForm = $("create-room-form");
    els.cancelCreateRoom = $("cancel-create-room");
    els.closeImageModal = $("close-image-modal");
    els.modalImage = $("modal-image");
    els.loadMore = $("load-more");
  }

  function setupEventListeners() {
    // Tab switching for auth modal
    $$$(".tab-btn[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        switchTab(btn.dataset.tab);
      });
    });

    // Sidebar tabs
    $$$(".sidebar-tabs .tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        switchSidebarTab(btn.dataset.tab);
      });
    });

    // Login form
    els.loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await login(new FormData(els.loginForm));
    });

    // Register form
    els.registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await register(new FormData(els.registerForm));
    });

    // Logout
    els.logoutBtn.addEventListener("click", logout);

    // Message form
    els.messageForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await sendMessage();
    });

    // Room list clicks
    els.roomList.addEventListener("click", (e) => {
      const item = e.target.closest(".room-item");
      if (item) {
        switchRoom(item.dataset.room);
      }
    });

    // Create room
    els.createRoomBtn = $("create-room-btn");
    els.createRoomBtn.addEventListener("click", () => showModal(els.createRoomModal));
    els.cancelCreateRoom.addEventListener("click", () => hideModal(els.createRoomModal));
    els.closeCreateRoomModal = $("close-create-room-modal");
    els.closeCreateRoomModal.addEventListener("click", () => hideModal(els.createRoomModal));
    els.createRoomForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await createRoom(new FormData(els.createRoomForm));
    });

    // Emoji picker
    els.emojiBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      els.emojiPicker.classList.toggle("hidden");
    });

    doc.addEventListener("click", () => {
      els.emojiPicker.classList.add("hidden");
      els.contextMenu.classList.add("hidden");
    });

    // File upload
    els.attachBtn.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", uploadFile);

    // Avatar upload
    els.changeAvatarBtn.addEventListener("click", () => els.avatarInput.click());
    els.avatarInput.addEventListener("change", uploadAvatar);

    // Settings
    els.saveProfileBtn.addEventListener("click", saveProfile);
    els.changePasswordBtn.addEventListener("click", changePassword);

    // Image modal
    els.closeImageModal.addEventListener("click", () => hideModal(els.imageModal));

    // Context menu
    els.messages.addEventListener("contextmenu", (e) => {
      const msgEl = e.target.closest(".message");
      if (!msgEl) return;
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, msgEl);
    });

    // Load more
    els.loadMore.addEventListener("click", loadMoreMessages);

    // Reply cancel
    els.cancelReply.addEventListener("click", () => {
      replyTo = null;
      els.replyPreview.classList.add("hidden");
    });

    // Search users
    els.userSearch.addEventListener("input", debounce(filterUsers, 300));

    // Emoji buttons
    for (let i = 0; i < emojis.length; i++) {
      const btn = doc.createElement("button");
      btn.textContent = emojis[i];
      btn.addEventListener("click", () => insertEmoji(emojis[i]));
      els.emojiPicker.appendChild(btn);
    }
  }

  function switchTab(tab) {
    $$$(".tab-btn[data-tab]").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
    $$$(".form-panel").forEach(panel => panel.classList.toggle("active", panel.id === tab + "-form"));
  }

  function switchSidebarTab(tab) {
    $$$(".sidebar-tabs .tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
    $$$(".panel").forEach(panel => panel.classList.toggle("active", panel.id === tab + "-panel"));
  }

  async function checkAuthState() {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const resp = await fetch("/api/user/profile", {
          headers: { "Authorization": "Bearer " + token }
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.success) {
            currentUser = data.user;
            showApp();
            return;
          }
        }
      } catch (e) {}
    }
    showAuth();
  }

  function showAuth() {
    els.authModal.classList.remove("hidden");
    els.app.classList.add("hidden");
  }

  function showApp() {
    els.authModal.classList.add("hidden");
    els.app.classList.remove("hidden");
    els.userDisplayName.textContent = currentUser.displayName || currentUser.username;
    els.userAvatar.textContent = (currentUser.displayName || currentUser.username)[0].toUpperCase();
    connectSSE();
    loadRooms();
    loadUsers();
    loadMessages();
  }

  async function login(formData) {
    const data = Object.fromEntries(formData);
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await resp.json();
      if (result.success) {
        localStorage.setItem("token", result.token);
        currentUser = result.user;
        showApp();
      } else {
        showError(els.loginError, result.error);
      }
    } catch (e) {
      showError(els.loginError, "网络错误");
    }
  }

  async function register(formData) {
    const data = Object.fromEntries(formData);
    if (data.password !== data.confirm) {
      showError(els.registerError, "两次密码不一致");
      return;
    }
    delete data.confirm;
    try {
      const resp = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await resp.json();
      if (result.success) {
        localStorage.setItem("token", result.token);
        currentUser = result.user;
        showApp();
      } else {
        showError(els.registerError, result.error);
      }
    } catch (e) {
      showError(els.registerError, "网络错误");
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {}
    localStorage.removeItem("token");
    currentUser = null;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    showAuth();
  }

  function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource("/events?username=" + encodeURIComponent(currentUser.username));
    
    eventSource.addEventListener("message_history", (e) => {
      const msgs = JSON.parse(e.data);
      renderMessages(msgs, true);
    });
    
    eventSource.addEventListener("online_users", (e) => {
      const users = JSON.parse(e.data);
      renderUsers(users);
    });
    
    eventSource.addEventListener("new_message", (e) => {
      const msg = JSON.parse(e.data);
      appendMessage(msg);
      if (msg.roomId === currentRoom) {
        scrollToBottom();
      }
    });
    
    eventSource.addEventListener("user_status", (e) => {
      const data = JSON.parse(e.data);
      updateUserStatus(data.username, data.status);
    });
    
    eventSource.onerror = () => {
      setTimeout(connectSSE, 3000);
    };
  }

  async function loadRooms() {
    try {
      const resp = await fetch("/api/rooms", {
        headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
      });
      const data = await resp.json();
      if (data.success) {
        renderRooms(data.rooms);
      }
    } catch (e) {}
  }

  async function loadUsers() {
    try {
      const resp = await fetch("/api/users", {
        headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
      });
      const data = await resp.json();
      if (data.success) {
        renderUsers(data.users);
      }
    } catch (e) {}
  }

  async function loadMessages() {
    isLoading = true;
    try {
      const resp = await fetch("/api/messages?roomId=" + currentRoom + "&offset=" + messageOffset + "&limit=50", {
        headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
      });
      const data = await resp.json();
      if (data.success) {
        renderMessages(data.messages, false);
        messageOffset += data.messages.length;
        els.loadMore.classList.toggle("hidden", data.messages.length < 50);
      }
    } catch (e) {}
    isLoading = false;
  }

  async function loadMoreMessages() {
    if (isLoading) return;
    await loadMessages();
  }

  function renderRooms(rooms) {
    els.roomList.innerHTML = "";
    rooms.forEach(room => {
      const li = doc.createElement("li");
      li.className = "room-item" + (room.id === currentRoom ? " active" : "");
      li.dataset.room = room.id;
      li.innerHTML = `
        <span class="room-icon">${room.id === "lobby" ? "#" : "💬"}</span>
        <span class="room-name">${escapeHtml(room.name)}</span>
        <span class="room-count" id="${room.id}-count">${room.userCount || 0}</span>
      `;
      els.roomList.appendChild(li);
    });
  }

  function renderUsers(users) {
    els.userList.innerHTML = "";
    users.forEach(user => {
      if (user.username === currentUser.username) return;
      const li = doc.createElement("li");
      li.className = "user-item";
      li.dataset.username = user.username;
      li.innerHTML = `
        <div class="avatar">${(user.displayName || user.username)[0].toUpperCase()}</div>
        <div class="user-info">
          <span class="user-name">${escapeHtml(user.displayName || user.username)}</span>
          <span class="user-role">${user.role === "admin" ? "管理员" : "用户"}</span>
        </div>
        <span class="status ${user.status}">${user.status === "online" ? "在线" : "离线"}</span>
      `;
      els.userList.appendChild(li);
    });
  }

  function filterUsers() {
    const query = els.userSearch.value.toLowerCase();
    $$$(".user-item").forEach(item => {
      const name = item.querySelector(".user-name").textContent.toLowerCase();
      item.style.display = name.includes(query) ? "" : "none";
    });
  }

  function updateUserStatus(username, status) {
    const item = els.userList.querySelector("[data-username=\"" + username + "\"]");
    if (item) {
      const statusEl = item.querySelector(".status");
      statusEl.className = "status " + status;
      statusEl.textContent = status === "online" ? "在线" : "离线";
    }
    // Update room counts
    loadRooms();
  }

  function renderMessages(messages, prepend) {
    const container = els.messages;
    if (prepend) {
      messages.reverse().forEach(msg => prependMessage(msg));
    } else {
      messages.forEach(msg => appendMessage(msg));
    }
  }

  function prependMessage(msg) {
    const el = createMessageElement(msg);
    els.messages.insertBefore(el, els.messages.firstChild);
  }

  function appendMessage(msg) {
    const el = createMessageElement(msg);
    els.messages.appendChild(el);
  }

  function createMessageElement(msg) {
    const div = doc.createElement("div");
    div.className = "message" + (msg.username === currentUser.username ? " own" : "");
    div.dataset.id = msg.id;
    div.dataset.username = msg.username;
    
    const time = new Date(msg.createdAt).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
    const avatarChar = (msg.displayName || msg.username)[0].toUpperCase();
    
    let content = "";
    if (msg.type === "image") {
      content = `<img class="message-image" src="${escapeHtml(msg.content)}" alt="图片">`;
    } else if (msg.type === "file") {
      const file = JSON.parse(msg.content);
      content = `
        <div class="message-file">
          <span class="message-file-icon">📄</span>
          <div class="message-file-info">
            <div class="message-file-name">${escapeHtml(file.name)}</div>
            <div class="message-file-size">${formatFileSize(file.size)}</div>
          </div>
          <a class="message-file-download" href="${escapeHtml(file.url)}" download>下载</a>
        </div>
      `;
    } else {
      content = `<div class="message-text">${escapeHtml(msg.content)}</div>`;
    }
    
    let replyHtml = "";
    if (msg.replyTo) {
      replyHtml = `
        <div class="message-reply">
          <div class="message-reply-sender">${escapeHtml(msg.replyTo.displayName || msg.replyTo.username)}</div>
          <div class="message-reply-text">${escapeHtml(msg.replyTo.content.substring(0, 50))}</div>
        </div>
      `;
    }
    
    div.innerHTML = `
      <div class="message-avatar">${avatarChar}</div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-sender">${escapeHtml(msg.displayName || msg.username)}</span>
          <span class="message-time">${time}</span>
        </div>
        ${replyHtml}
        ${content}
        <div class="message-actions">
          <button class="message-action-btn reply-action">回复</button>
          ${msg.username === currentUser.username ? `<button class="message-action-btn delete-action">删除</button>` : ""}
          <button class="message-action-btn copy-action">复制</button>
        </div>
      </div>
    `;
    
    // Event listeners for actions
    div.querySelector(".reply-action").addEventListener("click", () => startReply(msg));
    div.querySelector(".copy-action").addEventListener("click", () => copyMessage(msg));
    const deleteBtn = div.querySelector(".delete-action");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => deleteMessage(msg.id));
    }
    
    // Image click
    const img = div.querySelector(".message-image");
    if (img) {
      img.addEventListener("click", () => {
        els.modalImage.src = img.src;
        showModal(els.imageModal);
      });
    }
    
    return div;
  }

  function startReply(msg) {
    replyTo = msg;
    els.replyPreviewText.textContent = (msg.displayName || msg.username) + ": " + msg.content.substring(0, 50);
    els.replyPreview.classList.remove("hidden");
    els.messageInput.focus();
  }

  function copyMessage(msg) {
    navigator.clipboard.writeText(msg.content).then(() => {
      showError(els.messageInput, "已复制", true);
    });
  }

  async function deleteMessage(id) {
    if (!confirm("确定要删除这条消息吗？")) return;
    try {
      const resp = await fetch("/api/messages/" + id, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
      });
      const data = await resp.json();
      if (data.success) {
        const el = els.messages.querySelector("[data-id=\"" + id + "\"]");
        if (el) el.remove();
      }
    } catch (e) {}
  }

  async function sendMessage() {
    const text = els.messageInput.value.trim();
    if (!text && !replyTo) return;
    
    const formData = new FormData();
    formData.append("roomId", currentRoom);
    formData.append("content", text);
    if (replyTo) {
      formData.append("replyTo", replyTo.id);
    }
    
    try {
      const resp = await fetch("/api/messages", {
        method: "POST",
        headers: { "Authorization": "Bearer " + localStorage.getItem("token") },
        body: formData
      });
      const data = await resp.json();
      if (data.success) {
        els.messageInput.value = "";
        replyTo = null;
        els.replyPreview.classList.add("hidden");
      } else {
        showError(els.messageInput, data.error || "发送失败");
      }
    } catch (e) {
      showError(els.messageInput, "网络错误");
    }
  }

  async function uploadFile() {
    const file = els.fileInput.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("roomId", currentRoom);
    
    try {
      const resp = await fetch("/api/messages/upload", {
        method: "POST",
        headers: { "Authorization": "Bearer " + localStorage.getItem("token") },
        body: formData
      });
      const data = await resp.json();
      if (!data.success) {
        showError(els.messageInput, data.error || "上传失败");
      }
    } catch (e) {
      showError(els.messageInput, "网络错误");
    }
    
    els.fileInput.value = "";
  }

  async function uploadAvatar() {
    const file = els.avatarInput.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append("avatar", file);
    
    try {
      const resp = await fetch("/api/user/avatar", {
        method: "POST",
        headers: { "Authorization": "Bearer " + localStorage.getItem("token") },
        body: formData
      });
      const data = await resp.json();
      if (data.success) {
        currentUser.avatar = data.avatar;
        els.userAvatar.textContent = (currentUser.displayName || currentUser.username)[0].toUpperCase();
        if (data.avatar) {
          els.userAvatar.innerHTML = `<img src="${data.avatar}" alt="头像">`;
        }
        els.settingsAvatar.innerHTML = data.avatar ? `<img src="${data.avatar}" alt="头像">` : (currentUser.displayName || currentUser.username)[0].toUpperCase();
        showError(els.saveProfileBtn, "头像更新成功", true);
      } else {
        showError(els.saveProfileBtn, data.error || "上传失败");
      }
    } catch (e) {
      showError(els.saveProfileBtn, "网络错误");
    }
    
    els.avatarInput.value = "";
  }

  async function saveProfile() {
    const displayName = els.settingsDisplayName.value.trim();
    if (!displayName) {
      showError(els.saveProfileBtn, "请输入显示名称");
      return;
    }
    
    try {
      const resp = await fetch("/api/user/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify({ displayName })
      });
      const data = await resp.json();
      if (data.success) {
        currentUser.displayName = displayName;
        els.userDisplayName.textContent = displayName;
        els.userAvatar.textContent = displayName[0].toUpperCase();
        showError(els.saveProfileBtn, "保存成功", true);
      } else {
        showError(els.saveProfileBtn, data.error || "保存失败");
      }
    } catch (e) {
      showError(els.saveProfileBtn, "网络错误");
    }
  }

  async function changePassword() {
    const current = els.currentPassword.value;
    const newPass = els.newPassword.value;
    const confirm = els.confirmNewPassword.value;
    
    if (!current || !newPass || !confirm) {
      showError(els.changePasswordBtn, "请填写所有字段");
      return;
    }
    if (newPass !== confirm) {
      showError(els.changePasswordBtn, "两次密码不一致");
      return;
    }
    if (newPass.length < 6) {
      showError(els.changePasswordBtn, "新密码至少6位");
      return;
    }
    
    try {
      const resp = await fetch("/api/user/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify({ currentPassword: current, newPassword: newPass })
      });
      const data = await resp.json();
      if (data.success) {
        els.currentPassword.value = "";
        els.newPassword.value = "";
        els.confirmNewPassword.value = "";
        showError(els.changePasswordBtn, "密码修改成功", true);
      } else {
        showError(els.changePasswordBtn, data.error || "修改失败");
      }
    } catch (e) {
      showError(els.changePasswordBtn, "网络错误");
    }
  }

  async function createRoom(formData) {
    const data = Object.fromEntries(formData);
    try {
      const resp = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify(data)
      });
      const result = await resp.json();
      if (result.success) {
        hideModal(els.createRoomModal);
        els.createRoomForm.reset();
        loadRooms();
        switchRoom(result.room.id);
      } else {
        showError($$("#create-room-form .error-message") || els.createRoomForm, result.error || "创建失败");
      }
    } catch (e) {
      showError($$("#create-room-form .error-message") || els.createRoomForm, "网络错误");
    }
  }

  function switchRoom(roomId) {
    currentRoom = roomId;
    messageOffset = 0;
    els.messages.innerHTML = "";
    $$$(".room-item").forEach(item => item.classList.toggle("active", item.dataset.room === roomId));
    const room = $$(".room-item.active .room-name");
    if (room) {
      els.currentRoomName.textContent = room.textContent;
      els.currentRoomIcon.textContent = roomId === "lobby" ? "#" : "💬";
    }
    loadMessages();
    loadRooms();
  }

  function insertEmoji(emoji) {
    const input = els.messageInput;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.setRangeText(emoji);
    input.focus();
    els.emojiPicker.classList.add("hidden");
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = [" B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + sizes[i];
  }

  function scrollToBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function showModal(modal) {
    modal.classList.remove("hidden");
    doc.body.style.overflow = "hidden";
  }

  function hideModal(modal) {
    modal.classList.add("hidden");
    doc.body.style.overflow = "";
  }

  function showContextMenu(x, y, msgEl) {
    els.contextMenu.style.left = x + "px";
    els.contextMenu.style.top = y + "px";
    els.contextMenu.classList.remove("hidden");
    
    const isOwn = msgEl.dataset.username === currentUser.username;
    els.contextMenu.classList.toggle("show-own", isOwn);
    
    // Update action handlers
    els.contextMenu.querySelector(".reply-action").onclick = () => {
      startReply({
        id: msgEl.dataset.id,
        username: msgEl.dataset.username,
        displayName: msgEl.querySelector(".message-sender").textContent,
        content: msgEl.querySelector(".message-text")?.textContent || ""
      });
      els.contextMenu.classList.add("hidden");
    };
    els.contextMenu.querySelector(".copy-action").onclick = () => {
      const text = msgEl.querySelector(".message-text")?.textContent || "";
      navigator.clipboard.writeText(text);
      els.contextMenu.classList.add("hidden");
    };
    const deleteBtn = els.contextMenu.querySelector(".delete-action");
    if (deleteBtn) {
      deleteBtn.onclick = () => {
        deleteMessage(msgEl.dataset.id);
        els.contextMenu.classList.add("hidden");
      };
    }
  }

  function showError(element, message, isSuccess = false) {
    element.textContent = message;
    element.className = isSuccess ? "success" : "";
    setTimeout(() => {
      element.textContent = "";
      element.classList.remove("success");
    }, 3000);
  }

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function escapeHtml(text) {
    const div = doc.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  doc.addEventListener("DOMContentLoaded", init);
  win.addEventListener("beforeunload", logout);
})();
