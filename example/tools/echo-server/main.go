package main

import (
	"context"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

var startTime = time.Now()

// EchoServer implements the EchoService
type EchoServer struct {
	UnimplementedEchoServiceServer
}

// Echo implements the Echo RPC method
func (s *EchoServer) Echo(ctx context.Context, req *EchoRequest) (*EchoResponse, error) {
	log.Printf("=== gRPC Echo Request ===")
	log.Printf("Message: %s", req.Message)
	log.Printf("Metadata: %v", req.Metadata)
	
	response := &EchoResponse{
		Message:   req.Message,
		Metadata:  req.Metadata,
		Timestamp: time.Now().Unix(),
	}
	
	log.Printf("=== gRPC Echo Response ===")
	log.Printf("Response: %v", response)
	log.Println(strings.Repeat("-", 50))
	
	return response, nil
}

// GetStatus implements the GetStatus RPC method
func (s *EchoServer) GetStatus(ctx context.Context, req *StatusRequest) (*StatusResponse, error) {
	log.Printf("=== gRPC GetStatus Request ===")
	
	uptime := time.Since(startTime).Seconds()
	response := &StatusResponse{
		Status:  "OK",
		Version: "1.0.0",
		Uptime:  int64(uptime),
	}
	
	log.Printf("=== gRPC GetStatus Response ===")
	log.Printf("Response: %v", response)
	log.Println(strings.Repeat("-", 50))
	
	return response, nil
}

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
	var wg sync.WaitGroup
	
	// Start HTTP server
	wg.Add(1)
	go func() {
		defer wg.Done()
		
		// ルートハンドラーを設定
		http.HandleFunc("/", echoHandler)
		
		// サーバー起動ログ
		port := ":8080"
		log.Printf("Starting HTTP echo server on port %s", port)
		log.Println("Send requests to http://localhost:8080")
		
		// HTTP サーバー開始
		if err := http.ListenAndServe(port, nil); err != nil {
			log.Fatalf("HTTP server failed to start: %v", err)
		}
	}()
	
	// Start gRPC server
	wg.Add(1)
	go func() {
		defer wg.Done()
		
		lis, err := net.Listen("tcp", ":50051")
		if err != nil {
			log.Fatalf("gRPC server failed to listen: %v", err)
		}
		
		grpcServer := grpc.NewServer()
		RegisterEchoServiceServer(grpcServer, &EchoServer{})
		
		// Enable reflection for gRPC clients to discover services
		reflection.Register(grpcServer)
		
		log.Printf("Starting gRPC echo server on port :50051")
		log.Println("gRPC reflection enabled")
		
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gRPC server failed to start: %v", err)
		}
	}()
	
	log.Println("Both HTTP (8080) and gRPC (50051) servers started")
	log.Println("Press Ctrl+C to stop")
	
	// Wait for both servers
	wg.Wait()
}
