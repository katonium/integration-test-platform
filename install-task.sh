# Install Go

GOVERSION=1.24.4
wget https://go.dev/dl/go${GOVERSION}.linux-amd64.tar.gz
rm -rf /usr/local/go && tar -C /usr/local -xzf go${GOVERSION}.linux-amd64.tar.gz

export PATH=$PATH:/usr/local/go/bin
which go

# Install task
go install github.com/go-task/task/v3/cmd/task@latest

export PATH=$PATH:$(go env GOPATH)/bin
which task

# add task to the PATH permanently
echo "export PATH=\$PATH:$(go env GOPATH)/bin" >> ~/.bashrc
echo "export PATH=\$PATH:/usr/local/go/bin" >> ~/.bashrc

# Clean up
rm go${GOVERSION}.linux-amd64.tar.gz
