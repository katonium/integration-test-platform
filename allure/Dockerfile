FROM amazoncorretto:21

# Install curl and other dependencies
RUN yum update -y && \
    yum install -y curl tar gzip && \
    yum clean all

# Download and install Allure
ENV ALLURE_VERSION=2.24.0
RUN curl -L "https://github.com/allure-framework/allure2/releases/download/${ALLURE_VERSION}/allure-${ALLURE_VERSION}.tgz" -o allure.tgz && \
    tar -xzf allure.tgz && \
    mv allure-${ALLURE_VERSION} /opt/allure && \
    rm allure.tgz

# Add Allure to PATH
ENV PATH="/opt/allure/bin:${PATH}"

# Create directory for results
RUN mkdir -p /app/allure-results

# Set working directory
WORKDIR /app

# Expose port for Allure serve
EXPOSE 8080

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Default command
ENTRYPOINT ["/entrypoint.sh"]