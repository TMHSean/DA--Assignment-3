# Stage 1: Build Stage
FROM node:18-alpine AS build

#still created using root
WORKDIR /build 

COPY package.json /build/
COPY 3api-1.0.0.tgz /build/

RUN mkdir -p /tmp/package \
    && echo "Extracting package.json from tarball..." \
    && tar -xzf /build/3api-1.0.0.tgz -C /tmp package/package.json \
    && echo "Comparing package.json files..." \
    && if cmp -s /build/package.json /tmp/package/package.json; then \
        echo "Package.json files match."; \
    else \
        echo "Package.json files do not match. Exiting..."; \
        echo "Content of local package.json:" \
        && cat /build/package.json \
        && echo "Content of extracted package.json:" \
        && cat /tmp/package/package.json \
        && exit 1; \
    fi

# Install production dependencies only
RUN npm install --only=production /build/3api-1.0.0.tgz

# Clean up the build folder to reduce image size
RUN rm -rf /build/3api-1.0.0.tgz

# Stage 2: Final Stage
FROM node:18-alpine

WORKDIR /app

# Copy only the necessary files from the build stage
COPY --from=build /build/node_modules/3api/node_modules /app/node_modules
COPY --from=build /build/package.json /app/package.json

# Clean up the build folder to reduce image size
RUN rm -rf /build
RUN rm -rf /app/3api-1.0.0.tgz

COPY . /app

# Create a new non-root, non-system user with UID above 1000
RUN adduser -D -u 1001 -H ABC

# Switch to the new user
USER ABC

# Expose the port the app runs on
EXPOSE 8080

# Run the application
CMD ["node", "app.js"]