#!/bin/bash
GOVERSION=1.24.4

# Install Go if not already installed
if ! command -v go &> /dev/null; then
    echo "Go is not installed. Installing Go version ${GOVERSION}..."

    wget https://go.dev/dl/go${GOVERSION}.linux-amd64.tar.gz
    rm -rf /usr/local/go && tar -C /usr/local -xzf go${GOVERSION}.linux-amd64.tar.gz

    export PATH=$PATH:/usr/local/go/bin
    which go

    # Clean up
    rm go${GOVERSION}.linux-amd64.tar.gz

    # check if Go is installed successfully
    if ! command -v go &> /dev/null; then
        echo "Go installation failed. Please check the logs."
        exit 1
    else
        echo "Go version $(go version) installed successfully."
    fi
else
    echo "Go is already installed."
fi

# Install task
go install github.com/go-task/task/v3/cmd/task@latest

export PATH=$PATH:$(go env GOPATH)/bin
which task

# add task to the PATH permanently if not already added
echo "export PATH=\$PATH:$(go env GOPATH)/bin" >> ~/.bashrc
echo "export PATH=\$PATH:/usr/local/go/bin" >> ~/.bashrc
