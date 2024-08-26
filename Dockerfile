# Use Node.js 18 Alpine as the base image
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your application code
COPY . /app

# Create a new non-root, non-system user with UID above 1000
RUN adduser -D -u 1001 -H ABC

# # Check if the user exists and test the home directory
# RUN id ABC && echo "User ABC exists" \
#     && echo "Home directory of ABC: $(echo $HOME)" \
#     && echo "Checking if home directory is accessible: $(ls -ld /home/ABC || echo 'Home directory does not exist or is inaccessible')"

# Switch to the new user
USER root

# Expose the port the app runs on
# EXPOSE 8080

# Run the application
CMD ["node", "app.js"]
