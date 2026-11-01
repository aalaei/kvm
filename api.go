package kvm

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func StartAPIServer(port int) {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(corsMiddleware())
	r.Use(apiKeyAuthMiddleware(config.APIKey))

	// Health check (no auth required)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"device":  GetDeviceID(),
			"version": builtAppVersion,
		})
	})

	// API routes
	api := r.Group("/api/lan")
	{
		// Mouse
		api.POST("/mouse/absolute", handleAPIMouseAbsolute)
		api.POST("/mouse/relative", handleAPIMouseRelative)
		api.POST("/mouse/click", handleAPIMouseClick)
		api.POST("/mouse/scroll", handleAPIMouseScroll)

		// Keyboard
		api.POST("/keyboard/key", handleAPIKeyboardKey)
		api.POST("/keyboard/combo", handleAPIKeyboardCombo)
		api.POST("/keyboard/type", handleAPIKeyboardType)

		// Capture
		api.GET("/capture", handleAPICapture)

		// Status
		api.GET("/status", handleAPIStatus)
		api.GET("/video/state", handleAPIVideoState)
	}

	addr := fmt.Sprintf(":%d", port)
	logger.Info().Str("addr", addr).Msg("Starting LAN API server")
	if err := r.Run(addr); err != nil {
		logger.Error().Err(err).Msg("LAN API server failed")
	}
}

// === Middleware ===

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func apiKeyAuthMiddleware(expectedKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip auth for health endpoint
		if c.Request.URL.Path == "/health" {
			c.Next()
			return
		}
		
		// Skip auth for localhost
		remoteAddr := c.Request.RemoteAddr
		if strings.HasPrefix(remoteAddr, "127.0.0.1:") || 
		   strings.HasPrefix(remoteAddr, "[::1]:") {
			c.Next()
			return
		}
		
		// If no API key configured, reject LAN requests
		if expectedKey == "" {
			c.AbortWithStatusJSON(401, gin.H{"error": "API key not configured"})
			return
		}
		
		auth := c.GetHeader("Authorization")
		var key string
		if _, err := fmt.Sscanf(auth, "Bearer %s", &key); err != nil {
			c.AbortWithStatusJSON(401, gin.H{"error": "missing or invalid authorization"})
			return
		}
		if !strings.EqualFold(key, expectedKey) {
			c.AbortWithStatusJSON(401, gin.H{"error": "invalid api key"})
			return
		}
		c.Next()
	}
}

// === API Handlers: Mouse ===

func handleAPIMouseAbsolute(c *gin.Context) {
	var req struct {
		X       int   `json:"x" binding:"required"`
		Y       int   `json:"y" binding:"required"`
		Buttons uint8 `json:"buttons"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_, err := callRPCHandler(rpcHandlers["absMouseReport"], map[string]interface{}{
		"x": req.X, "y": req.Y, "buttons": req.Buttons,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "x": req.X, "y": req.Y})
}

func handleAPIMouseRelative(c *gin.Context) {
	var req struct {
		Dx      int8  `json:"dx" binding:"required"`
		Dy      int8  `json:"dy" binding:"required"`
		Buttons uint8 `json:"buttons"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_, err := callRPCHandler(rpcHandlers["relMouseReport"], map[string]interface{}{
		"dx": req.Dx, "dy": req.Dy, "buttons": req.Buttons,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "dx": req.Dx, "dy": req.Dy})
}

func handleAPIMouseClick(c *gin.Context) {
	var req struct {
		Button string `json:"button" binding:"required"`
		Double bool   `json:"double"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var buttons uint8
	switch req.Button {
	case "left":
		buttons = 1
	case "right":
		buttons = 2
	case "middle":
		buttons = 4
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("unknown button: %s", req.Button)})
		return
	}
	clickCount := 1
	if req.Double {
		clickCount = 2
	}
	for i := 0; i < clickCount; i++ {
		_, err := callRPCHandler(rpcHandlers["absMouseReport"], map[string]interface{}{
			"x": 0, "y": 0, "buttons": buttons,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		_, err = callRPCHandler(rpcHandlers["absMouseReport"], map[string]interface{}{
			"x": 0, "y": 0, "buttons": 0,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "button": req.Button, "clicks": clickCount})
}

func handleAPIMouseScroll(c *gin.Context) {
	var req struct {
		Delta int8 `json:"delta" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_, err := callRPCHandler(rpcHandlers["wheelReport"], map[string]interface{}{
		"wheelY": req.Delta,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "delta": req.Delta})
}

// === API Handlers: Keyboard ===

func handleAPIKeyboardKey(c *gin.Context) {
	var req struct {
		Key    string `json:"key" binding:"required"`
		Action string `json:"action"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	keyCode, ok := keyNameToCode[req.Key]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("unknown key: %s", req.Key)})
		return
	}
	action := strings.ToLower(req.Action)
	if action == "" {
		action = "press"
	}
	switch action {
	case "press":
		_, err := callRPCHandler(rpcHandlers["keyboardReport"], map[string]interface{}{
			"modifier": 0, "keys": []uint8{keyCode},
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		_, err = callRPCHandler(rpcHandlers["keyboardReport"], map[string]interface{}{
			"modifier": 0, "keys": []uint8{},
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	case "down":
		_, err := callRPCHandler(rpcHandlers["keyboardReport"], map[string]interface{}{
			"modifier": 0, "keys": []uint8{keyCode},
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	case "up":
		_, err := callRPCHandler(rpcHandlers["keyboardReport"], map[string]interface{}{
			"modifier": 0, "keys": []uint8{},
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("unknown action: %s", req.Action)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "key": req.Key, "action": action})
}

func handleAPIKeyboardCombo(c *gin.Context) {
	var req struct {
		Keys []string `json:"keys" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var keys []uint8
	var modifier uint8
	for _, keyName := range req.Keys {
		switch strings.ToLower(keyName) {
		case "ctrl", "control":
			modifier |= 0x01
			continue
		case "shift":
			modifier |= 0x02
			continue
		case "alt":
			modifier |= 0x04
			continue
		case "meta", "win", "cmd":
			modifier |= 0x08
			continue
		}
		keyCode, ok := keyNameToCode[keyName]
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("unknown key: %s", keyName)})
			return
		}
		keys = append(keys, keyCode)
	}
	_, err := callRPCHandler(rpcHandlers["keyboardReport"], map[string]interface{}{
		"modifier": modifier, "keys": keys,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_, err = callRPCHandler(rpcHandlers["keyboardReport"], map[string]interface{}{
		"modifier": 0, "keys": []uint8{},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "keys": req.Keys})
}

func handleAPIKeyboardType(c *gin.Context) {
	var req struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for _, char := range req.Text {
		keyCode, modifier, ok := charToKeyCode(uint8(char))
		if !ok {
			continue
		}
		_, err := callRPCHandler(rpcHandlers["keyboardReport"], map[string]interface{}{
			"modifier": modifier, "keys": []uint8{keyCode},
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		_, err = callRPCHandler(rpcHandlers["keyboardReport"], map[string]interface{}{
			"modifier": 0, "keys": []uint8{},
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "text": req.Text})
}

// === API Handlers: Capture ===

func handleAPICapture(c *gin.Context) {
	data, err := captureScreenshot("jpeg")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "image/jpeg", data)
}

// === API Handlers: Status ===

func handleAPIStatus(c *gin.Context) {
	state := lastVideoState
	c.JSON(http.StatusOK, gin.H{
		"video": gin.H{
			"ready":  state.Ready,
			"width":  state.Width,
			"height": state.Height,
			"fps":    state.FramePerSecond,
			"error":  state.Error,
		},
		"device": gin.H{
			"name":    "PicoKVM",
			"version": builtAppVersion,
		},
	})
}

func handleAPIVideoState(c *gin.Context) {
	state := lastVideoState
	c.JSON(http.StatusOK, gin.H{
		"ready":  state.Ready,
		"width":  state.Width,
		"height": state.Height,
		"fps":    state.FramePerSecond,
		"error":  state.Error,
	})
}
