FROM node:18

WORKDIR /app

# Copy necessary files
COPY package.json /app/

# Copy the rest of your application code
COPY . /app

# Create a new non-root, non-system user with UID above 1000
RUN adduser -D -u 1001 -H ABC

# Switch to the new user
USER ABC

# Expose the port the app runs on
EXPOSE 8080

# Run the application
CMD ["node", "app.js"]
