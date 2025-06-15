package main

import (
	"io"
	"log"
	"net/http"
	"strings"
)

func echoHandler(w http.ResponseWriter, r *http.Request) {
	// リクエストヘッダーをログ出力
	log.Println("=== Request Headers ===")
	for name, values := range r.Header {
		for _, value := range values {
			log.Printf("%s: %s", name, value)
		}
	}

	// リクエストボディを読み取り
	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error reading body: %v", err)
		http.Error(w, "Error reading request body", http.StatusInternalServerError)
		return
	}
	defer r.Body.Close()

	// ボディをログ出力
	log.Println("=== Request Body ===")
	if len(body) > 0 {
		log.Printf("Body: %s", string(body))
	} else {
		log.Println("Body: (empty)")
	}

	// レスポンスヘッダーを設定（リクエストヘッダーをエコー）
	for name, values := range r.Header {
		for _, value := range values {
			w.Header().Add(name, value)
		}
	}

	// Content-Lengthは自動で設定されるので削除
	w.Header().Del("Content-Length")

	// レスポンス情報をログ出力
	log.Println("=== Response ===")
	log.Printf("Status: 200 OK")
	log.Printf("Echoing back %d bytes", len(body))

	// ボディをエコーバック
	w.WriteHeader(http.StatusOK)
	if len(body) > 0 {
		w.Write(body)
	}

	log.Println(strings.Repeat("-", 50))
}

func main() {
	// ルートハンドラーを設定
	http.HandleFunc("/", echoHandler)

	// サーバー起動ログ
	port := ":8080"
	log.Printf("Starting HTTP echo server on port %s", port)
	log.Println("Send requests to http://localhost:8080")
	log.Println("Press Ctrl+C to stop")

	// サーバー開始
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
