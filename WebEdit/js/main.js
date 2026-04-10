// WebEdit - Main Script
// 该脚本包含 Background Service Worker 和 Content Script 的逻辑
// 通过环境检测来区分运行模式

const isServiceWorker = typeof chrome !== 'undefined' && chrome.runtime && chrome.action;
const isContentScript = typeof window !== 'undefined' && typeof document !== 'undefined' && !chrome.action;

// ==========================================
// Background Service Worker Logic
// ==========================================
if (isServiceWorker) {
    console.log("WebEdit: Running in Background Service Worker mode");

    const sendMessageToTab = (tabId, message, callback) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                // console.warn("Could not send message:", chrome.runtime.lastError.message);
            } else if (callback) {
                callback(response);
            }
        });
    };

    const updateContextMenu = (isDesignModeOn) => {
        const title = isDesignModeOn ? "🔵 Disable Edit Mode" : "⚪ Enable Edit Mode";
        chrome.contextMenus.update("openDesignMode", { title: title }, () => {
            if (chrome.runtime.lastError) {
                // Ignore error if menu doesn't exist yet
            }
        });
    };

    const updateIcon = (tabId, isDesignModeOn) => {
        const iconName = isDesignModeOn ? "edit_on.png" : "edit_off.png";
        // 使用绝对路径以防万一
        const iconPath = "/images/" + iconName;
        
        // 为了防止缓存，使用字典格式并强制刷新
        console.log(`Updating icon for tab ${tabId} to ${iconName}`);
        
        chrome.action.setIcon({ 
            tabId: tabId, 
            path: {
                "16": iconPath,
                "48": iconPath,
                "128": iconPath
            } 
        }, () => {
            if (chrome.runtime.lastError) {
                console.error("SetIcon Error:", chrome.runtime.lastError.message);
            }
        });

        // Update context menu if this is the active tab
        chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => {
            if (tabs.length > 0 && tabs[0].id === tabId) {
                updateContextMenu(isDesignModeOn);
            }
        });
    };

    const toggleDesignMode = (tab) => {
        if (!tab || !tab.id) return;

        // 先查询当前状态，然后取反
        sendMessageToTab(tab.id, { action: "getStatus" }, (response) => {
            let newStatus = "on";
            if (response && response.designMode === "on") {
                newStatus = "off";
            }
            
            // 发送新状态
            sendMessageToTab(tab.id, { designMode: newStatus }, () => {
                // 更新图标
                updateIcon(tab.id, newStatus === "on");
            });
        });
    };

    // 监听图标点击事件
    chrome.action.onClicked.addListener((tab) => {
        toggleDesignMode(tab);
    });

    // 监听快捷键命令
    chrome.commands.onCommand.addListener((command) => {
        if (command === "toggle-design-mode") {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs.length > 0) {
                    toggleDesignMode(tabs[0]);
                }
            });
        }
    });

    // Context Menu 逻辑
    const contextMenus = {
        id: "openDesignMode",
        title: "⚪ Enable Edit Mode", // Default state
        type: "normal",
        contexts: ["page", "editable"],
    };

    chrome.runtime.onInstalled.addListener(() => {
        // 防止重复创建菜单错误
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create(contextMenus);
        });
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === "openDesignMode") {
            toggleDesignMode(tab);
        }
    });

    // 监听 Tab 切换或更新，尝试同步图标状态
    chrome.tabs.onActivated.addListener((activeInfo) => {
        sendMessageToTab(activeInfo.tabId, { action: "getStatus" }, (response) => {
            if (response) {
                const isOn = response.designMode === "on";
                updateIcon(activeInfo.tabId, isOn);
            } else {
                // 如果无法获取状态（例如页面不支持），重置为关闭状态
                updateIcon(activeInfo.tabId, false);
            }
        });
    });

    // 监听页面更新（例如刷新），重置图标状态
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete') {
            sendMessageToTab(tabId, { action: "getStatus" }, (response) => {
                if (response) {
                    const isOn = response.designMode === "on";
                    updateIcon(tabId, isOn);
                } else {
                    updateIcon(tabId, false);
                }
            });
        }
    });

    // 监听窗口焦点变化
    chrome.windows.onFocusChanged.addListener((windowId) => {
        if (windowId === chrome.windows.WINDOW_ID_NONE) return;
        chrome.tabs.query({active: true, windowId: windowId}, (tabs) => {
            if (tabs.length > 0) {
                 sendMessageToTab(tabs[0].id, { action: "getStatus" }, (response) => {
                    const isOn = response && response.designMode === "on";
                    updateIcon(tabs[0].id, isOn);
                });
            }
        });
    });
}

// ==========================================
// Content Script Logic
// ==========================================
if (isContentScript) {
    console.log("WebEdit: Running in Content Script mode");

    function showToast(message, type = "info") {
        // 移除旧的 toast
        const oldToast = document.getElementById("webedit-toast");
        if (oldToast) {
            oldToast.remove();
        }

        const toast = document.createElement("div");
        toast.id = "webedit-toast";
        toast.textContent = message;
        
        // 样式设置（使用 !important 防止被页面样式覆盖）
        toast.style.setProperty("position", "fixed", "important");
        toast.style.setProperty("top", "50%", "important");
        toast.style.setProperty("left", "50%", "important");
        toast.style.setProperty("right", "auto", "important");
        toast.style.setProperty("bottom", "auto", "important");
        toast.style.padding = "12px 24px";
        toast.style.borderRadius = "8px";
        toast.style.fontFamily = "system-ui, -apple-system, sans-serif";
        toast.style.fontSize = "14px";
        toast.style.fontWeight = "500";
        toast.style.zIndex = "2147483647"; // Max z-index
        toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
        toast.style.transition = "opacity 0.3s ease, transform 0.3s ease";
        toast.style.opacity = "0";
        toast.style.transform = "translate(-50%, -50%) scale(0.96)";

        if (type === "success") {
            toast.style.backgroundColor = "#3b82f6"; // Blue 500 for Enabled
            toast.style.color = "#ffffff";
        } else {
            toast.style.backgroundColor = "#6b7280"; // Gray 500 for Disabled
            toast.style.color = "#ffffff";
        }

        document.body.appendChild(toast);

        // 动画显示
        requestAnimationFrame(() => {
            toast.style.opacity = "1";
            toast.style.transform = "translate(-50%, -50%) scale(1)";
        });

        // 自动消失
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translate(-50%, -50%) scale(0.96)";
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    // 监听 background 传来的 数据
    chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
        // console.log("WebEdit received:", data);
        
        if (data.action === "getStatus") {
            sendResponse({ designMode: document.designMode === "on" ? "on" : "off" });
            return;
        }

        if (data.designMode == "on") {
            document.designMode = "on";
            showToast("Edit Mode Enabled", "success");
        } else if (data.designMode == "off") {
            document.designMode = "off";
            showToast("Edit Mode Disabled", "info");
        }
        sendResponse("ok");
    });

    // 捕获并拦截点击事件，防止跳转和触发页面原有逻辑
    document.addEventListener("click", (e) => {
        if (document.designMode === "on") {
            // 允许选择和光标放置，但阻止链接跳转和原有JS逻辑
            // 如果是链接，阻止默认行为（跳转）
            let target = e.target;
            let isLink = false;
            while (target && target !== document) {
                if (target.tagName === 'A') {
                    isLink = true;
                    break;
                }
                target = target.parentNode;
            }

            if (isLink) {
                e.preventDefault();
            }

            // 阻止事件冒泡和同一元素上的其他监听器
            e.stopImmediatePropagation();
            e.stopPropagation();
        }
    }, true); // 使用捕获阶段，确保最先执行
}
