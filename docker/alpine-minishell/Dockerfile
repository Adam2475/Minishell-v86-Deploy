FROM docker.io/i386/alpine:3.21.0

ENV KERNEL=virt
ENV RUNTIME_PACKAGES="openrc alpine-base agetty alpine-conf linux-virt linux-firmware-none nodejs readline ncurses-libs"
ENV BUILD_PACKAGES="build-base make readline-dev ncurses-dev linux-headers"

RUN apk add --no-cache $RUNTIME_PACKAGES
RUN apk add --no-cache --virtual .build-deps $BUILD_PACKAGES

RUN sed -i 's/getty 38400 tty1/agetty --autologin root tty1 linux/' /etc/inittab
RUN echo 'ttyS0::respawn:/sbin/agetty --autologin root -s ttyS0 115200 vt100' >> /etc/inittab
RUN echo "root:" | chpasswd
RUN setup-hostname localhost

RUN printf '%s\n' \
    'rmmod ne2k-pci && modprobe ne2k-pci || true' \
    'rmmod virtio-net && modprobe virtio-net || true' \
    'hwclock -s || true' \
    'setup-interfaces -a -r || true' \
    > /root/networking.sh && chmod +x /root/networking.sh

RUN for service in devfs dmesg mdev hwdrivers; do rc-update add "$service" sysinit; done
RUN for service in hwclock modules sysctl hostname syslog bootmisc; do rc-update add "$service" boot; done
RUN rc-update add killprocs shutdown
RUN mkinitfs -F "base virtio 9p" "$(cat /usr/share/kernel/${KERNEL}/kernel.release)"

WORKDIR /opt/minishell-src
COPY . /opt/minishell-src

RUN make fclean || true
RUN make
RUN cp /opt/minishell-src/minishell /root/minishell
RUN cp /opt/minishell-src/portfolio-v86-demo/guest-overlay/root/minishell-demo.sh /root/minishell-demo.sh
RUN cp /opt/minishell-src/portfolio-v86-demo/guest-overlay/etc/profile.d/zz-minishell-demo.sh /etc/profile.d/zz-minishell-demo.sh
RUN chmod +x /root/minishell /root/minishell-demo.sh /etc/profile.d/zz-minishell-demo.sh

RUN rm -rf /opt/minishell-src
RUN apk del .build-deps
