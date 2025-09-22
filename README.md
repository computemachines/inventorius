# Inventori.us

The subtree-merge for the frontend and backed. Also contains docker compose
files for running behind a nginx server.

## Ansible Playbooks

This project includes three ansible playbooks for database and deployment management:

### 1. Database Backup (`deployment/backup-db.yml`)

**Purpose**: Downloads MongoDB backup from production server  
**When to use**: 
- Before major deployments or updates
- For scheduled production backups
- When you need to capture current production state

**Usage**:
```bash
ansible-playbook -i deployment/inventory.ini deployment/backup-db.yml
```

**What it does**:
- Creates compressed MongoDB dump on production server
- Downloads backup file to `deployment/backups/` directory
- Validates backup file integrity
- Provides backup file information

---

### 2. Database Restore (`deployment/restore-db.yml`)

**Purpose**: Restores MongoDB database from backup file  
**When to use**:
- Setting up development environment with production data
- Restoring after database corruption or data loss
- Testing migrations or updates with real data

**Usage**:
```bash
# For local development environment
ansible-playbook -i deployment/inventory-local.ini deployment/restore-db.yml -e backup_file=filename.gz

# For production restore (use with extreme caution)
ansible-playbook -i deployment/inventory.ini deployment/restore-db.yml -e backup_file=filename.gz
```

**What it does**:
- Validates backup file exists in `deployment/backups/` directory
- Safely stops dependent services
- Drops existing database and restores from backup
- Restarts all services and verifies database connectivity
- Cleans up temporary files

**⚠️ Warning**: This playbook drops all existing database data. Always backup current data first.

---

### 3. Development Deployment (`deployment/deploy-dev.yml`)

**Purpose**: Deploys complete development environment using Docker Compose  
**When to use**:
- Setting up new development environment
- Refreshing development environment
- Testing deployment process locally

**Usage**:
```bash
ansible-playbook -i deployment/inventory-local.ini deployment/deploy-dev.yml
```

**What it does**:
- Creates development directory structure
- Copies and configures docker-compose.dev.yml
- Automatically fixes build context paths for local development
- Loads pre-built container images if available
- Starts all services (MongoDB, API, Frontend, Nginx)
- Optionally restores database from dump.archive if present
- Verifies all services are running correctly

**Access**: After successful deployment, application is available at `http://localhost`

---

### Inventory Files

- `deployment/inventory.ini`: Production server configuration
- `deployment/inventory-local.ini`: Local development configuration

### Prerequisites

- Ansible 2.x installed
- Docker and Docker Compose available (for local deployments)
- SSH access to production server (for production operations)
- Container images built and available in `../dist/` directory (for deployments)
