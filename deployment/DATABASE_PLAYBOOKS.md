# Inventorius Database Management Playbooks

This document describes the three Ansible playbooks created for managing the Inventorius MongoDB database.

## Playbooks Created

### 1. backup-db.yml
**Purpose**: Backup MongoDB database from production server and download locally

**Features**:
- Creates backup directory if it doesn't exist
- Checks if MongoDB container is running before backup
- Creates timestamped backup files
- Verifies backup file was created successfully  
- Downloads backup to local machine
- Displays backup information including file size

**Usage**:
```bash
ansible-playbook -i deployment/inventory.ini deployment/backup-db.yml
```

**Output**: 
- Remote backup: `/opt/inventorius/backups/inventorius_backup_YYYY-MM-DD_HH-MM.gz`
- Local backup: `./backups/inventorius_backup_YYYY-MM-DD_HH-MM.gz`

### 2. restore-db.yml  
**Purpose**: Restore MongoDB database from a backup file

**Features**:
- Validates backup file parameter is provided
- Checks if local backup file exists
- Uploads backup file to target server
- Verifies MongoDB container is running
- Safely stops dependent services during restore
- Restores database with --drop flag (replaces existing data)
- Restarts all services after restore
- Verifies MongoDB is accessible after restore
- Cleans up temporary files

**Usage**:
```bash
ansible-playbook -i deployment/inventory-local.ini deployment/restore-db.yml -e "backup_file=inventorius_backup_2025-09-20_22-55.gz"
```

**Required Parameter**: `backup_file` - Name of the backup file in ./backups/ directory

### 3. deploy-dev.yml
**Purpose**: Deploy development environment with docker-compose.dev.yml

**Features**:
- Creates development directory structure
- Copies docker-compose.dev.yml and nginx dev configuration
- Creates development environment file
- Handles container images if they exist in dist/ directory
- Stops any existing services before deployment
- Starts development environment with --build flag
- Waits for MongoDB to be ready
- Optionally restores database from dump.archive if present
- Displays service status after deployment

**Usage**:
```bash
# For production server (requires sudo)
ansible-playbook -i deployment/inventory.ini deployment/deploy-dev.yml

# For local development (no sudo)
ansible-playbook -i deployment/inventory-local.ini deployment/deploy-dev.yml
```

**Optional**: Place `dump.archive` in project root to automatically restore database during deployment

## Complete Workflow Example

### Download Production Database and Restore to Local Development

1. **Backup production database**:
   ```bash
   ansible-playbook -i deployment/inventory.ini deployment/backup-db.yml
   ```

2. **Deploy local development environment**:
   ```bash
   ansible-playbook -i deployment/inventory-local.ini deployment/deploy-dev.yml
   ```

3. **Restore production backup to local development**:
   ```bash
   ansible-playbook -i deployment/inventory-local.ini deployment/restore-db.yml -e "backup_file=inventorius_backup_2025-09-20_22-55.gz"
   ```

## Inventory Files

### inventory.ini
- Production server (inventori.us)
- Uses sudo/become
- Uses /opt/bin/docker-compose

### inventory-local.ini  
- Localhost development
- No sudo required
- Uses standard docker commands
- Deploys to ./dev-deployment directory

## Directory Structure

```
deployment/
├── backup-db.yml           # Backup playbook
├── restore-db.yml          # Restore playbook  
├── deploy-dev.yml          # Development deployment
├── inventory.ini           # Production inventory
├── inventory-local.ini     # Local inventory
├── backups/               # Downloaded backups
│   └── inventorius_backup_*.gz
└── dev-deployment/        # Local development files
    ├── docker-compose.yml
    ├── .env
    ├── nginx/
    └── images/
```

## Error Handling

All playbooks include:
- Parameter validation
- Service status checks  
- File existence verification
- Graceful error handling with meaningful messages
- Cleanup of temporary files

## Notes

- Backup filenames include timestamp for easy identification
- Restore operation uses --drop flag to completely replace existing data
- Development deployment works both locally and on remote servers
- All playbooks are non-conditional and run all tasks in sequence
- Container naming is flexible to work with different deployment scenarios