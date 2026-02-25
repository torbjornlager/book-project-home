---
layout: page
title: Blog
---

{% for post in site.posts %}
- [{{ post.title }}]({{ post.url | prepend: site.baseurl }}) <span style="color:#666; font-size:0.9rem;">{{ post.date | date: "%Y-%m-%d" }}</span>
{% endfor %}