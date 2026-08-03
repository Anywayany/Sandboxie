"use strict";

const navItems = [...document.querySelectorAll(".nav-item")];
const sections = [...document.querySelectorAll(".section")];
const agentIndicator = document.getElementById("agent-indicator");
const agentTitle = document.getElementById("agent-title");
const agentDetail = document.getElementById("agent-detail");
const loadingBar = document.getElementById("loading-bar");
const retryButton = document.getElementById("retry-button");
const agentFrame = document.getElementById("agent-frame");
const agentStateCard = document.getElementById("agent-state-card");

function renderRequestError(error) {
  renderAgentState({
    phase: "error",
    message: error instanceof Error ? error.message : String(error)
  });
}

function setSection(sectionName) {
  for (const item of navItems) {
    item.classList.toggle("active", item.dataset.section === sectionName);
  }
  for (const section of sections) {
    section.classList.toggle("active", section.id === sectionName);
  }
}

function renderAgentState(state) {
  agentIndicator.className = `agent-indicator ${state.phase}`;
  retryButton.hidden = true;
  loadingBar.hidden = true;
  agentStateCard.hidden = false;

  switch (state.phase) {
    case "ready":
      if (state.desktopUrl && agentFrame.src !== state.desktopUrl) {
        agentFrame.src = state.desktopUrl;
      }
      agentFrame.hidden = false;
      agentStateCard.hidden = true;
      break;
    case "error":
      agentFrame.hidden = true;
      agentFrame.src = "about:blank";
      agentTitle.textContent = "智能体启动失败";
      agentDetail.textContent = state.message || "请确认企业已安装 Light Sandboxie Core。";
      retryButton.hidden = false;
      break;
    case "stopping":
      agentFrame.hidden = true;
      agentFrame.src = "about:blank";
      agentTitle.textContent = "正在重置安全环境";
      agentDetail.textContent = "请稍候。";
      loadingBar.hidden = false;
      break;
    case "stopped":
      agentFrame.hidden = true;
      agentFrame.src = "about:blank";
      agentTitle.textContent = "PicoClaw 尚未启动";
      agentDetail.textContent = "点击机器人按钮后，服务将在 PicoClawBox 中运行。";
      break;
    default:
      agentFrame.hidden = true;
      agentTitle.textContent = "正在准备安全环境";
      agentDetail.textContent = "正在通过 Light Sandboxie Core 启动 PicoClaw。";
      loadingBar.hidden = false;
  }
}

for (const item of navItems) {
  item.addEventListener("click", async () => {
    try {
      const section = item.dataset.section;
      setSection(section);
      if (section === "agent") {
        renderAgentState({ phase: "starting" });
      }
      const state = await window.wendiDesktop.selectSection(section);
      renderAgentState(state);
    } catch (error) {
      renderRequestError(error);
    }
  });
}

retryButton.addEventListener("click", async () => {
  try {
    renderAgentState({ phase: "starting" });
    const state = await window.wendiDesktop.retryAgent();
    renderAgentState(state);
  } catch (error) {
    renderRequestError(error);
  }
});

window.wendiDesktop.onAgentState(renderAgentState);
window.wendiDesktop.getAgentState().then(renderAgentState, renderRequestError);
