# SVN
yum install subversion

# S3CMD
wget http://s3tools.org/repo/RHEL_6/s3tools.repo -o /etc/yum.repos.d/s3tools.repo
yum install -y s3cmd
# s3cmd sync --acl-public --delete-removed ~/prototype-docs/ s3://docs.node.ee/proto/

# Install PHP + phpdoc
yum -y install php php-pear php-cli php-common
pear update-channels
pear install PhpDocumentor

# Install Ruby
yum install -y ruby-devel rubygems

# Install PDOC + JSDuck
gem install json rdiscount pdoc jsduck
